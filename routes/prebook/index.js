const crypto = require("crypto");
const express = require("express");
const Razorpay = require("razorpay");
const prisma = require("../../lib/prisma");
const { assignTokenAndQueue } = require("../orders");

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

const SLOT_MINUTES = Number.parseInt(
  process.env.PREBOOK_SLOT_MINUTES || "30",
  10
);
const MAX_ORDERS_PER_SLOT = Number.parseInt(
  process.env.PREBOOK_MAX_ORDERS_PER_SLOT || "20",
  10
);
const LEAD_MINUTES = Number.parseInt(
  process.env.PREBOOK_LEAD_MINUTES || "20",
  10
);
const OPEN_HOUR = Number.parseInt(process.env.CANTEEN_OPEN_HOUR || "9", 10);
const CLOSE_HOUR = Number.parseInt(process.env.CANTEEN_CLOSE_HOUR || "21", 10);
const RESERVATION_MINUTES = Number.parseInt(
  process.env.PREBOOK_RESERVATION_MINUTES || "15",
  10
);

function getSlotBounds(date) {
  const open = new Date(date);
  open.setHours(OPEN_HOUR, 0, 0, 0);
  const close = new Date(date);
  close.setHours(CLOSE_HOUR, 0, 0, 0);
  return { open, close };
}

function getSlotEnd(slotStart) {
  return new Date(slotStart.getTime() + SLOT_MINUTES * 60 * 1000);
}

function isAlignedToSlot(date) {
  return (
    date.getMinutes() % SLOT_MINUTES === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0
  );
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
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

  return { items, total };
}

async function countSlotUsage(canteenId, slotStart, excludePrebookId = null) {
  const now = new Date();
  const prebookWhere = {
    canteenId,
    slotStart,
    OR: [
      { status: "CONFIRMED" },
      { status: "PENDING_PAYMENT", expiresAt: { gt: now } },
    ],
  };
  if (excludePrebookId) {
    prebookWhere.NOT = { id: excludePrebookId };
  }

  const [prebookCount, orderCount] = await Promise.all([
    prisma.prebook.count({ where: prebookWhere }),
    prisma.order.count({
      where: {
        canteenId,
        isPrebooked: true,
        scheduledFor: slotStart,
        status: { in: ["PAID", "READY", "DELIVERED"] },
      },
    }),
  ]);

  return prebookCount + orderCount;
}

router.get("/slots", async (req, res) => {
  const canteenId = parseId(req.query.canteenId);
  const dateStr = req.query.date;
  if (canteenId === null) {
    return res.status(400).json({ error: "canteenId must be an integer" });
  }
  if (!dateStr) {
    return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
  }

  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return res.status(400).json({ error: "invalid date" });
  }

  const today = new Date();
  if (!isSameDay(date, today)) {
    return res.status(400).json({ error: "only same-day slots are supported" });
  }

  const { open, close } = getSlotBounds(date);
  const slotMs = SLOT_MINUTES * 60 * 1000;
  const slots = [];

  for (let ts = open.getTime(); ts + slotMs <= close.getTime(); ts += slotMs) {
    slots.push(new Date(ts));
  }

  try {
    const usage = await Promise.all(
      slots.map((slotStart) => countSlotUsage(canteenId, slotStart))
    );

    res.json({
      date: dateStr,
      canteenId,
      slotMinutes: SLOT_MINUTES,
      capacity: MAX_ORDERS_PER_SLOT,
      workingHours: { openHour: OPEN_HOUR, closeHour: CLOSE_HOUR },
      slots: slots.map((slotStart, idx) => ({
        start: slotStart.toISOString(),
        end: getSlotEnd(slotStart).toISOString(),
        remaining: Math.max(0, MAX_ORDERS_PER_SLOT - usage[idx]),
      })),
    });
  } catch (error) {
    console.error("Failed to fetch prebook slots:", error);
    res.status(500).json({ error: "Failed to fetch slots" });
  }
});

router.post("/create", async (req, res) => {
  const razorpay = getRazorpay();
  if (!razorpay) {
    return res.status(500).json({ error: "Razorpay keys not configured" });
  }

  const studentId = parseId(req.body.studentId);
  if (studentId === null) {
    return res.status(400).json({ error: "studentId must be an integer" });
  }

  const slotStart = new Date(req.body.slotStart);
  if (Number.isNaN(slotStart.getTime())) {
    return res.status(400).json({ error: "slotStart is required (ISO string)" });
  }

  const now = new Date();
  if (!isSameDay(slotStart, now)) {
    return res.status(400).json({ error: "slot must be for today" });
  }
  if (!isAlignedToSlot(slotStart)) {
    return res.status(400).json({ error: "slotStart must align to slot duration" });
  }
  const { open, close } = getSlotBounds(slotStart);
  const slotEnd = getSlotEnd(slotStart);
  if (slotStart < open || slotEnd > close) {
    return res.status(400).json({ error: "slot is outside working hours" });
  }
  if (slotStart.getTime() < now.getTime()) {
    return res.status(400).json({ error: "slotStart must be in the future" });
  }

  try {
    const cart = await prisma.cart.findUnique({ where: { studentId } });
    if (!cart) {
      return res.status(404).json({ error: "Cart not found" });
    }

    const result = await calculateCartTotal(cart.id);
    if (result.items.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    const used = await countSlotUsage(cart.canteenId, slotStart);
    if (used >= MAX_ORDERS_PER_SLOT) {
      return res.status(409).json({ error: "Slot is full" });
    }

    const amountPaise = Math.round(result.total * 100);
    const razorpayOrder = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: `prebook_${Date.now()}`,
    });

    const expiresAt = new Date(
      Date.now() + RESERVATION_MINUTES * 60 * 1000
    );

    const prebook = await prisma.prebook.create({
      data: {
        studentId,
        canteenId: cart.canteenId,
        slotStart,
        slotEnd,
        total: result.total,
        currency: "INR",
        razorpayOrderId: razorpayOrder.id,
        expiresAt,
        items: {
          create: result.items.map((item) => ({
            canteenItemId: item.canteenItemId,
            quantity: item.quantity,
            price: item.canteenItem.price,
            total: item.quantity * item.canteenItem.price,
          })),
        },
      },
    });

    res.status(201).json({
      prebookId: prebook.id,
      slotStart: slotStart.toISOString(),
      slotEnd: slotEnd.toISOString(),
      expiresAt: prebook.expiresAt.toISOString(),
      razorpay: {
        orderId: razorpayOrder.id,
        key: process.env.RAZORPAY_KEY_ID,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
      },
    });
  } catch (error) {
    console.error("Prebook create failed:", error);
    res.status(500).json({ error: "Failed to create prebook" });
  }
});

router.post("/verify", async (req, res) => {
  if (!isRazorpayReady()) {
    return res.status(500).json({ error: "Razorpay keys not configured" });
  }

  const prebookId = parseId(req.body.prebookId);
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (prebookId === null) {
    return res.status(400).json({ error: "prebookId must be an integer" });
  }
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
    const prebook = await prisma.prebook.findUnique({
      where: { id: prebookId },
      include: { items: true },
    });
    if (!prebook) {
      return res.status(404).json({ error: "Prebook not found" });
    }
    if (prebook.razorpayOrderId !== razorpay_order_id) {
      return res.status(400).json({ error: "Order id mismatch" });
    }

    if (prebook.status === "CONFIRMED") {
      const existing = await prisma.order.findUnique({
        where: { orderId: prebook.razorpayOrderId },
        include: { items: true },
      });
      return res.json({ status: "verified", order: existing });
    }

    if (prebook.expiresAt.getTime() < Date.now()) {
      await prisma.prebook.update({
        where: { id: prebook.id },
        data: { status: "EXPIRED" },
      });
      return res.status(400).json({ error: "Prebook expired" });
    }

    const used = await countSlotUsage(prebook.canteenId, prebook.slotStart, prebook.id);
    if (used >= MAX_ORDERS_PER_SLOT) {
      await prisma.prebook.update({
        where: { id: prebook.id },
        data: { status: "CANCELLED" },
      });
      return res.status(409).json({ error: "Slot is full" });
    }

    const created = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          orderId: razorpay_order_id,
          transactionId: razorpay_payment_id,
          status: "PAID",
          total: prebook.total,
          currency: prebook.currency,
          studentId: prebook.studentId,
          canteenId: prebook.canteenId,
          isPrebooked: true,
          scheduledFor: prebook.slotStart,
          items: {
            create: prebook.items.map((item) => ({
              canteenItemId: item.canteenItemId,
              quantity: item.quantity,
              price: item.price,
              total: item.total,
            })),
          },
        },
        include: { items: true },
      });

      await tx.prebook.update({
        where: { id: prebook.id },
        data: { status: "CONFIRMED" },
      });

      return order;
    });

    let tokenNumber = null;
    const dueTime = new Date(Date.now() + LEAD_MINUTES * 60 * 1000);
    if (created.scheduledFor && created.scheduledFor <= dueTime) {
      tokenNumber = await assignTokenAndQueue(created.id);
    }

    res.json({ status: "verified", order: { ...created, tokenNumber } });
  } catch (error) {
    console.error("Prebook verify failed:", error);
    res.status(500).json({ error: "Failed to verify prebook" });
  }
});

module.exports = router;
