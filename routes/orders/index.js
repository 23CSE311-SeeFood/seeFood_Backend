const crypto = require("crypto");
const express = require("express");
const Razorpay = require("razorpay");
const prisma = require("../../lib/prisma");
const { getRedis } = require("../../lib/redis");
const { broadcastToCanteen } = require("../../lib/ws");

const router = express.Router();

let razorpayInstance = null;

function isRazorpayReady() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

function getRazorpay() {
  if (!isRazorpayReady()) return null;
  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpayInstance;
}

function parseId(value) {
  const num = Number(value);
  return Number.isInteger(num) ? num : null;
}

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function secondsUntilEndOfDay(date = new Date()) {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return Math.max(1, Math.floor((end - date) / 1000));
}

function getQueueScore(tokenNumber, enqueueTsMs = Date.now()) {
  return tokenNumber + enqueueTsMs / 1e13;
}

function buildQueuePayload(order, item, tokenNumber) {
  const category = item.canteenItem?.category || "OTHER";
  const station = CATEGORY_TO_STATION[category] || "GENERAL";
  return JSON.stringify({
    orderId: order.id,
    orderItemId: item.id,
    tokenNumber,
    canteenItemId: item.canteenItemId,
    itemName: item.canteenItem?.name || null,
    quantity: item.quantity,
    category,
    station,
  });
}

function getStation(item) {
  const category = item.canteenItem?.category || "OTHER";
  return CATEGORY_TO_STATION[category] || "GENERAL";
}

function getQueueKey(canteenId, station, dateKey) {
  return `queue:${canteenId}:${station}:${dateKey}`;
}

async function enqueueItem(order, item, tokenNumber, dateKey, enqueueTsMs = Date.now()) {
  const redis = await getRedis();
  const station = getStation(item);
  const queueKey = getQueueKey(order.canteenId, station, dateKey);
  const payload = buildQueuePayload(order, item, tokenNumber);
  const score = getQueueScore(tokenNumber, enqueueTsMs);
  await redis.zAdd(queueKey, [{ score, value: payload }]);
  await redis.expire(queueKey, secondsUntilEndOfDay());
}

async function removeItemFromQueue(order, item, tokenNumber, dateKey) {
  const redis = await getRedis();
  const station = getStation(item);
  const queueKey = getQueueKey(order.canteenId, station, dateKey);
  const payload = buildQueuePayload(order, item, tokenNumber);
  await redis.zRem(queueKey, payload);
}

async function getOrderQueueInfo(orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { canteenItem: true } } },
  });
  if (!order || !order.tokenNumber) return null;

  const redis = await getRedis();
  const queueDate = order.scheduledFor || order.createdAt;
  const dateKey = getDateKey(new Date(queueDate));
  const queues = [];

  for (const item of order.items) {
    const station = getStation(item);
    const queueKey = getQueueKey(order.canteenId, station, dateKey);
    const payload = buildQueuePayload(order, item, order.tokenNumber);
    const position = await redis.zRank(queueKey, payload);
    queues.push({
      station,
      orderItemId: item.id,
      position: position === null ? null : position + 1,
    });
  }

  return {
    orderId: order.id,
    tokenNumber: order.tokenNumber,
    queues,
    orderStatus: order.status,
  };
}

async function calculateCartTotal(cartId) {
  const items = await prisma.cartItem.findMany({
    where: { cartId },
    include: { canteenItem: true },
  });
  const total = items.reduce(
    (sum, item) => sum + item.quantity * item.canteenItem.price,
    0
  );
  return { total, items };
}

async function calculateItemsTotal(canteenId, items) {
  const normalized = items.map((item) => ({
    canteenItemId: parseId(item.canteenItemId),
    quantity: Number(item.quantity),
  }));

  if (normalized.some((item) => item.canteenItemId === null)) {
    throw new Error("INVALID_ITEM_ID");
  }
  if (normalized.some((item) => !Number.isInteger(item.quantity) || item.quantity <= 0)) {
    throw new Error("INVALID_QUANTITY");
  }

  const itemIds = normalized.map((item) => item.canteenItemId);
  const dbItems = await prisma.canteenItem.findMany({
    where: { id: { in: itemIds }, canteenId },
  });
  if (dbItems.length !== itemIds.length) {
    throw new Error("INVALID_ITEMS");
  }

  const priceMap = new Map(dbItems.map((item) => [item.id, item.price]));
  const total = normalized.reduce(
    (sum, item) => sum + item.quantity * (priceMap.get(item.canteenItemId) || 0),
    0
  );

  return { total, normalized, priceMap };
}

const CATEGORY_TO_STATION = {
  RICE: "RICE",
  CURRIES: "CURRIES",
  ICECREAM: "ICECREAM",
  ROOTI: "ROOTI",
  DRINKS: "DRINKS",
  OTHER: "GENERAL",
};

// In-memory fallback for lock commands used in tests when the Redis
// client returned by `getRedis` is a partial mock and doesn't implement
// `set/get/del` used for token assignment locking.
const _inMemoryRedisLocks = new Map();
function ensureLockCommands(redis) {
  if (typeof redis.set !== "function") {
    redis.set = async (key, value, opts) => {
      if (opts && opts.NX) {
        if (_inMemoryRedisLocks.has(key)) return null;
        _inMemoryRedisLocks.set(key, value);
        if (opts.PX) {
          setTimeout(() => {
            if (_inMemoryRedisLocks.get(key) === value) _inMemoryRedisLocks.delete(key);
          }, opts.PX);
        }
        return "OK";
      }
      _inMemoryRedisLocks.set(key, value);
      return "OK";
    };
  }

  if (typeof redis.get !== "function") {
    redis.get = async (key) => {
      return _inMemoryRedisLocks.has(key) ? _inMemoryRedisLocks.get(key) : null;
    };
  }

  if (typeof redis.del !== "function") {
    redis.del = async (key) => {
      return _inMemoryRedisLocks.delete(key) ? 1 : 0;
    };
  }
}

const PREBOOK_LEAD_MINUTES = Number.parseInt(
  process.env.PREBOOK_LEAD_MINUTES || "20",
  10
);

let prebookIntervalStarted = false;

async function processDuePrebookOrders() {
  const dueTime = new Date(Date.now() + PREBOOK_LEAD_MINUTES * 60 * 1000);
  const orders = await prisma.order.findMany({
    where: {
      isPrebooked: true,
      status: "PAID",
      tokenNumber: null,
      scheduledFor: { lte: dueTime },
    },
    select: { id: true },
  });

  for (const order of orders) {
    try {
      await assignTokenAndQueue(order.id);
    } catch (error) {
      console.error("Failed to enqueue prebook order:", error);
    }
  }
}

function startPrebookScheduler() {
  if (prebookIntervalStarted) return;
  prebookIntervalStarted = true;
  const interval = setInterval(() => {
    processDuePrebookOrders().catch((error) => {
      console.error("Prebook scheduler error:", error);
    });
  }, 60 * 1000);
  interval.unref();
}

startPrebookScheduler();

async function assignTokenAndQueue(orderId) {
  const redis = await getRedis();
  ensureLockCommands(redis);
  const lockKey = `order:${orderId}:token_lock`;
  const lockTtlMs = 10000;
  const maxAttempts = 5;
  let lockValue = null;
  let lockAcquired = false;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    lockValue = crypto.randomUUID
      ? crypto.randomUUID()
      : crypto.randomBytes(16).toString("hex");
    const ok = await redis.set(lockKey, lockValue, { NX: true, PX: lockTtlMs });
    if (ok) {
      lockAcquired = true;
      break;
    }

    const existing = await prisma.order.findUnique({
      where: { id: orderId },
      select: { tokenNumber: true },
    });
    if (existing?.tokenNumber) {
      return existing.tokenNumber;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (!lockAcquired) {
    throw new Error("TOKEN_ASSIGNMENT_IN_PROGRESS");
  }

  let order = null;
  try {
    order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { canteenItem: true } } },
    });
    if (!order) {
      throw new Error("ORDER_NOT_FOUND");
    }
    if (order.tokenNumber) {
      return order.tokenNumber;
    }

    const serviceDate = order.scheduledFor || new Date();
    const dateKey = getDateKey(new Date(serviceDate));
    const tokenKey = `token:${order.canteenId}:${dateKey}`;

    const tokenNumber = await redis.incr(tokenKey);
    if (tokenNumber === 1) {
      await redis.expire(tokenKey, secondsUntilEndOfDay());
    }

    for (const item of order.items) {
      await enqueueItem(order, item, tokenNumber, dateKey);
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { tokenNumber },
    });

    const queueInfo = await getOrderQueueInfo(order.id);
    if (queueInfo) {
      broadcastToCanteen(order.canteenId, {
        type: "queue_update",
        ...queueInfo,
      });
    }

    return tokenNumber;
  } finally {
    try {
      const current = await redis.get(lockKey);
      if (current === lockValue) {
        await redis.del(lockKey);
      }
    } catch (err) {
      console.error("Failed to release order lock:", err);
    }
  }
}

router.post("/create", async (req, res) => {
  const razorpay = getRazorpay();
  if (!razorpay) {
    return res.status(500).json({ error: "Razorpay keys not configured" });
  }

  const studentId = parseId(req.body.studentId);
  const cashierId = parseId(req.body.cashierId);
  if (studentId === null && cashierId === null) {
    return res
      .status(400)
      .json({ error: "studentId or cashierId must be provided" });
  }
  if (studentId !== null && cashierId !== null) {
    return res.status(400).json({ error: "Provide only studentId or cashierId" });
  }

  try {
    let total = 0;
    let canteenId = null;
    let orderItemsData = [];

    if (studentId !== null) {
      const cart = await prisma.cart.findUnique({ where: { studentId } });
      if (!cart) {
        return res.status(404).json({ error: "Cart not found" });
      }

      const result = await calculateCartTotal(cart.id);
      if (result.items.length === 0) {
        return res.status(400).json({ error: "Cart is empty" });
      }

      total = result.total;
      canteenId = cart.canteenId;
      orderItemsData = result.items.map((item) => ({
        canteenItemId: item.canteenItemId,
        quantity: item.quantity,
        price: item.canteenItem.price,
        total: item.quantity * item.canteenItem.price,
      }));
    } else {
      const items = Array.isArray(req.body.items) ? req.body.items : [];
      if (items.length === 0) {
        return res.status(400).json({ error: "items are required" });
      }

      const cashier = await prisma.cashier.findUnique({ where: { id: cashierId } });
      if (!cashier) {
        return res.status(404).json({ error: "Cashier not found" });
      }

      canteenId = cashier.canteenId;

      let calc;
      try {
        calc = await calculateItemsTotal(canteenId, items);
      } catch (err) {
        if (err.message === "INVALID_ITEM_ID") {
          return res.status(400).json({ error: "invalid canteenItemId" });
        }
        if (err.message === "INVALID_QUANTITY") {
          return res.status(400).json({ error: "invalid quantity" });
        }
        if (err.message === "INVALID_ITEMS") {
          return res.status(400).json({ error: "items must belong to canteen" });
        }
        throw err;
      }

      total = calc.total;
      orderItemsData = calc.normalized.map((item) => ({
        canteenItemId: item.canteenItemId,
        quantity: item.quantity,
        price: calc.priceMap.get(item.canteenItemId),
        total: item.quantity * (calc.priceMap.get(item.canteenItemId) || 0),
      }));
    }

    let razorpayOrder = null;
    if (studentId !== null) {
      const amountPaise = Math.round(total * 100);
      razorpayOrder = await razorpay.orders.create({
        amount: amountPaise,
        currency: "INR",
        receipt: `order_${Date.now()}`,
      });
    }

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderId: razorpayOrder
            ? razorpayOrder.id
            : `cashier_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
          status: cashierId !== null ? "PAID" : "CREATED",
          total,
          currency: "INR",
          studentId,
          cashierId,
          canteenId,
          items: {
            create: orderItemsData,
          },
        },
        include: { items: true },
      });

      if (studentId !== null) {
        const cart = await tx.cart.findUnique({ where: { studentId } });
        if (cart) {
          await tx.cart.update({ where: { id: cart.id }, data: { total } });
        }
      }

      return created;
    });

    let tokenNumber = null;
    if (cashierId !== null) {
      tokenNumber = await assignTokenAndQueue(order.id);
    }

    res.status(201).json({
      order: { ...order, tokenNumber },
      razorpay: razorpayOrder
        ? {
            orderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
          }
        : null,
    });
  } catch (error) {
    console.error("Order create failed:", error);
    const details = process.env.NODE_ENV === "production" ? undefined : error.message;
    res.status(500).json({ error: "Failed to create order", details });
  }
});

router.post("/verify", async (req, res) => {
  if (!isRazorpayReady()) {
    return res.status(500).json({ error: "Razorpay keys not configured" });
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: "Missing payment verification fields" });
  }

  const body = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  if (expected !== razorpay_signature) {
    return res.status(400).json({ error: "Invalid signature" });
  }

  try {
    const updated = await prisma.order.update({
      where: { orderId: razorpay_order_id },
      data: {
        transactionId: razorpay_payment_id,
        status: "PAID",
      },
      include: { items: true },
    });
    const tokenNumber = await assignTokenAndQueue(updated.id);
    res.json({ status: "verified", order: { ...updated, tokenNumber } });
  } catch (error) {
    console.error("Order verify failed:", error);
    res.status(404).json({ error: "Order not found" });
  }
});

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "id must be an integer" });
  }

  try {
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: { include: { canteenItem: true } },
        canteen: true,
        student: true,
        cashier: true,
      },
    });
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

router.get("/student/:studentId", async (req, res) => {
  const studentId = parseId(req.params.studentId);
  if (studentId === null) {
    return res.status(400).json({ error: "studentId must be an integer" });
  }

  try {
    const orders = await prisma.order.findMany({
      where: {
        OR: [
          { studentId },
          { roomMembers: { some: { studentId } } },
        ],
      },
      orderBy: { id: "desc" },
      distinct: ["id"],
      include: {
        canteen: true,
        items: { include: { canteenItem: true } },
        room: true,
      },
    });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

router.get("/canteen/:canteenId", async (req, res) => {
  const canteenId = parseId(req.params.canteenId);
  if (canteenId === null) {
    return res.status(400).json({ error: "canteenId must be an integer" });
  }

  try {
    const orders = await prisma.order.findMany({
      where: { canteenId },
      orderBy: { id: "desc" },
      include: {
        canteen: true,
        student: true,
        cashier: true,
        items: { include: { canteenItem: true } },
      },
    });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

router.get("/:id/queue", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "id must be an integer" });
  }

  try {
    const info = await getOrderQueueInfo(id);
    if (!info) {
      return res.status(404).json({ error: "Order not found" });
    }
    res.json(info);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch queue position" });
  }
});

router.put("/items/:orderItemId/ready", async (req, res) => {
  const orderItemId = parseId(req.params.orderItemId);
  if (orderItemId === null) {
    return res.status(400).json({ error: "orderItemId must be an integer" });
  }

  try {
    const item = await prisma.orderItem.update({
      where: { id: orderItemId },
      data: { status: "READY" },
    });

    const order = await prisma.order.findUnique({
      where: { id: item.orderId },
    });
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const items = await prisma.orderItem.findMany({
      where: { orderId: item.orderId },
      select: { status: true },
    });

    const allReady = items.every((i) => i.status === "READY" || i.status === "DELIVERED");
    if (allReady) {
      await prisma.order.update({
        where: { id: item.orderId },
        data: { status: "READY" },
      });
    }

    if (order.tokenNumber) {
      const full = await prisma.orderItem.findUnique({
        where: { id: item.id },
        include: { canteenItem: true },
      });
      const dateKey = getDateKey(new Date(order.createdAt));
      await removeItemFromQueue(order, full, order.tokenNumber, dateKey);
    }

    const queueInfo = await getOrderQueueInfo(item.orderId);
    if (queueInfo) {
      broadcastToCanteen(order.canteenId, {
        type: "queue_update",
        ...queueInfo,
      });
    }

    res.json({ status: "ok" });
  } catch (error) {
    res.status(500).json({ error: "Failed to mark item ready" });
  }
});

router.put("/items/:orderItemId/delivered", async (req, res) => {
  const orderItemId = parseId(req.params.orderItemId);
  if (orderItemId === null) {
    return res.status(400).json({ error: "orderItemId must be an integer" });
  }

  try {
    const item = await prisma.orderItem.update({
      where: { id: orderItemId },
      data: { status: "DELIVERED" },
    });

    const order = await prisma.order.findUnique({
      where: { id: item.orderId },
    });
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const items = await prisma.orderItem.findMany({
      where: { orderId: item.orderId },
      select: { status: true },
    });

    const allDelivered = items.every((i) => i.status === "DELIVERED");
    if (allDelivered) {
      await prisma.order.update({
        where: { id: item.orderId },
        data: { status: "DELIVERED" },
      });
    }

    if (order.tokenNumber) {
      const full = await prisma.orderItem.findUnique({
        where: { id: item.id },
        include: { canteenItem: true },
      });
      const dateKey = getDateKey(new Date(order.createdAt));
      await removeItemFromQueue(order, full, order.tokenNumber, dateKey);
    }

    const queueInfo = await getOrderQueueInfo(item.orderId);
    if (queueInfo) {
      broadcastToCanteen(order.canteenId, {
        type: "queue_update",
        ...queueInfo,
      });
    }

    res.json({ status: "ok" });
  } catch (error) {
    res.status(500).json({ error: "Failed to mark item delivered" });
  }
});

router.put("/items/:orderItemId/start", async (req, res) => {
  const orderItemId = parseId(req.params.orderItemId);
  if (orderItemId === null) {
    return res.status(400).json({ error: "orderItemId must be an integer" });
  }

  try {
    const item = await prisma.orderItem.update({
      where: { id: orderItemId },
      data: { status: "IN_PROGRESS" },
    });

    const order = await prisma.order.findUnique({
      where: { id: item.orderId },
    });
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.tokenNumber) {
      const full = await prisma.orderItem.findUnique({
        where: { id: item.id },
        include: { canteenItem: true },
      });
      const dateKey = getDateKey(new Date(order.createdAt));
      await removeItemFromQueue(order, full, order.tokenNumber, dateKey);
    }

    const queueInfo = await getOrderQueueInfo(item.orderId);
    if (queueInfo) {
      broadcastToCanteen(order.canteenId, {
        type: "queue_update",
        ...queueInfo,
      });
    }

    res.json({ status: "ok" });
  } catch (error) {
    res.status(500).json({ error: "Failed to mark item in progress" });
  }
});

router.put("/items/:orderItemId/delayed", async (req, res) => {
  const orderItemId = parseId(req.params.orderItemId);
  if (orderItemId === null) {
    return res.status(400).json({ error: "orderItemId must be an integer" });
  }

  try {
    const item = await prisma.orderItem.update({
      where: { id: orderItemId },
      data: { status: "DELAYED" },
    });

    const order = await prisma.order.findUnique({
      where: { id: item.orderId },
    });
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.tokenNumber) {
      const full = await prisma.orderItem.findUnique({
        where: { id: item.id },
        include: { canteenItem: true },
      });
      const dateKey = getDateKey(new Date(order.createdAt));
      await removeItemFromQueue(order, full, order.tokenNumber, dateKey);
    }

    const queueInfo = await getOrderQueueInfo(item.orderId);
    if (queueInfo) {
      broadcastToCanteen(order.canteenId, {
        type: "queue_update",
        ...queueInfo,
      });
    }

    res.json({ status: "ok" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delay item" });
  }
});

router.put("/items/:orderItemId/requeue", async (req, res) => {
  const orderItemId = parseId(req.params.orderItemId);
  if (orderItemId === null) {
    return res.status(400).json({ error: "orderItemId must be an integer" });
  }

  try {
    const item = await prisma.orderItem.update({
      where: { id: orderItemId },
      data: { status: "PENDING" },
    });

    const order = await prisma.order.findUnique({
      where: { id: item.orderId },
    });
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    if (!order.tokenNumber) {
      return res.status(400).json({ error: "Order has no token yet" });
    }

    const full = await prisma.orderItem.findUnique({
      where: { id: item.id },
      include: { canteenItem: true },
    });
    const dateKey = getDateKey(new Date(order.createdAt));
    await enqueueItem(order, full, order.tokenNumber, dateKey);

    const queueInfo = await getOrderQueueInfo(item.orderId);
    if (queueInfo) {
      broadcastToCanteen(order.canteenId, {
        type: "queue_update",
        ...queueInfo,
      });
    }

    res.json({ status: "ok" });
  } catch (error) {
    res.status(500).json({ error: "Failed to requeue item" });
  }
});

module.exports = { router, assignTokenAndQueue };
