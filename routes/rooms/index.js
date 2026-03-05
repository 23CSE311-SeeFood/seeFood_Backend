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

const ROOM_EXPIRY_MINUTES = Number.parseInt(
  process.env.ROOM_EXPIRY_MINUTES || "15",
  10
);

function generateRoomCode() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
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

async function buildMergedItems(roomId) {
  const members = await prisma.roomMember.findMany({
    where: { roomId, status: "PAID" },
    include: { items: true },
  });

  const aggregate = new Map();
  for (const member of members) {
    for (const item of member.items) {
      const key = item.canteenItemId;
      const existing = aggregate.get(key) || { quantity: 0, total: 0, price: item.price };
      existing.quantity += item.quantity;
      existing.total += item.total;
      existing.price = item.price;
      aggregate.set(key, existing);
    }
  }

  return Array.from(aggregate.entries()).map(([canteenItemId, data]) => ({
    canteenItemId,
    quantity: data.quantity,
    price: data.price,
    total: data.total,
  }));
}

async function refundMemberPayment(member, razorpay) {
  if (!member.paymentId || !member.amount) return false;
  try {
    await razorpay.payments.refund(member.paymentId, {
      amount: Math.round(member.amount * 100),
    });
    await prisma.roomMember.update({
      where: { id: member.id },
      data: { status: "REFUNDED" },
    });
    return true;
  } catch (error) {
    console.error("Room refund failed:", error);
    return false;
  }
}

async function expireRooms() {
  const now = new Date();
  const rooms = await prisma.room.findMany({
    where: { status: "OPEN", expiresAt: { lt: now } },
    include: { members: true },
  });
  if (rooms.length === 0) return;

  const razorpay = getRazorpay();

  for (const room of rooms) {
    for (const member of room.members) {
      if (member.status === "PAID" && razorpay) {
        await refundMemberPayment(member, razorpay);
      } else if (member.status === "PENDING") {
        await prisma.roomMember.update({
          where: { id: member.id },
          data: { status: "CANCELLED" },
        });
      }
    }

    await prisma.room.update({
      where: { id: room.id },
      data: { status: "EXPIRED" },
    });
  }
}

let roomExpiryStarted = false;
function startRoomExpiryScheduler() {
  if (roomExpiryStarted) return;
  roomExpiryStarted = true;
  const interval = setInterval(() => {
    expireRooms().catch((error) => console.error("Room expiry error:", error));
  }, 60 * 1000);
  interval.unref();
}

startRoomExpiryScheduler();

router.post("/create", async (req, res) => {
  const ownerId = parseId(req.body.ownerId);
  if (ownerId === null) {
    return res.status(400).json({ error: "ownerId must be an integer" });
  }

  try {
    const cart = await prisma.cart.findUnique({ where: { studentId: ownerId } });
    if (!cart) {
      return res.status(404).json({ error: "Cart not found" });
    }

    const expiresAt = new Date(Date.now() + ROOM_EXPIRY_MINUTES * 60 * 1000);

    let room = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = generateRoomCode();
      try {
        room = await prisma.room.create({
          data: {
            code,
            ownerId,
            canteenId: cart.canteenId,
            expiresAt,
            members: {
              create: [{ studentId: ownerId }],
            },
          },
        });
        break;
      } catch (error) {
        if (error.code !== "P2002") throw error;
      }
    }

    if (!room) {
      return res.status(500).json({ error: "Failed to create room" });
    }

    res.status(201).json({
      roomId: room.id,
      code: room.code,
      canteenId: room.canteenId,
      expiresAt: room.expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("Room create failed:", error);
    res.status(500).json({ error: "Failed to create room" });
  }
});

router.post("/join", async (req, res) => {
  const code = String(req.body.code || "").trim().toUpperCase();
  const studentId = parseId(req.body.studentId);
  if (!code) {
    return res.status(400).json({ error: "code is required" });
  }
  if (studentId === null) {
    return res.status(400).json({ error: "studentId must be an integer" });
  }

  try {
    const room = await prisma.room.findUnique({
      where: { code },
      include: { members: true },
    });
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    if (room.status !== "OPEN") {
      return res.status(400).json({ error: "Room is not open" });
    }
    if (room.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: "Room expired" });
    }
    if (room.members.some((member) => member.status === "PAID")) {
      return res.status(400).json({ error: "Room locked after payments" });
    }

    const cart = await prisma.cart.findUnique({ where: { studentId } });
    if (!cart) {
      return res.status(404).json({ error: "Cart not found" });
    }
    if (cart.canteenId !== room.canteenId) {
      return res.status(400).json({ error: "Cart must be from same canteen" });
    }

    const member = await prisma.roomMember.upsert({
      where: { roomId_studentId: { roomId: room.id, studentId } },
      update: {},
      create: { roomId: room.id, studentId },
    });

    res.json({
      status: "joined",
      roomId: room.id,
      code: room.code,
      memberId: member.id,
    });
  } catch (error) {
    console.error("Room join failed:", error);
    res.status(500).json({ error: "Failed to join room" });
  }
});

router.get("/:code", async (req, res) => {
  const code = String(req.params.code || "").trim().toUpperCase();
  if (!code) {
    return res.status(400).json({ error: "code is required" });
  }

  try {
    const room = await prisma.room.findUnique({
      where: { code },
      include: {
        members: { include: { student: true } },
        canteen: true,
      },
    });
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    res.json({
      id: room.id,
      code: room.code,
      status: room.status,
      canteen: room.canteen,
      expiresAt: room.expiresAt.toISOString(),
      members: room.members.map((member) => ({
        id: member.id,
        studentId: member.studentId,
        name: member.student?.name || null,
        status: member.status,
        amount: member.amount,
      })),
    });
  } catch (error) {
    console.error("Room fetch failed:", error);
    res.status(500).json({ error: "Failed to fetch room" });
  }
});

router.post("/:code/pay/create", async (req, res) => {
  const razorpay = getRazorpay();
  if (!razorpay) {
    return res.status(500).json({ error: "Razorpay keys not configured" });
  }

  const code = String(req.params.code || "").trim().toUpperCase();
  const studentId = parseId(req.body.studentId);
  if (!code) {
    return res.status(400).json({ error: "code is required" });
  }
  if (studentId === null) {
    return res.status(400).json({ error: "studentId must be an integer" });
  }

  try {
    const room = await prisma.room.findUnique({
      where: { code },
      include: { members: true },
    });
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    if (room.status !== "OPEN") {
      return res.status(400).json({ error: "Room is not open" });
    }
    if (room.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: "Room expired" });
    }

    const member = room.members.find((m) => m.studentId === studentId);
    if (!member) {
      return res.status(404).json({ error: "Member not found in room" });
    }
    if (member.status === "PAID") {
      return res.status(400).json({ error: "Already paid" });
    }

    const cart = await prisma.cart.findUnique({ where: { studentId } });
    if (!cart) {
      return res.status(404).json({ error: "Cart not found" });
    }
    if (cart.canteenId !== room.canteenId) {
      return res.status(400).json({ error: "Cart must be from same canteen" });
    }

    const result = await calculateCartTotal(cart.id);
    if (result.items.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(result.total * 100),
      currency: "INR",
      receipt: `room_${room.id}_${studentId}_${Date.now()}`,
    });

    await prisma.$transaction(async (tx) => {
      await tx.roomMemberItem.deleteMany({ where: { roomMemberId: member.id } });
      await tx.roomMember.update({
        where: { id: member.id },
        data: {
          amount: result.total,
          razorpayOrderId: razorpayOrder.id,
        },
      });
      await tx.roomMemberItem.createMany({
        data: result.items.map((item) => ({
          roomMemberId: member.id,
          canteenItemId: item.canteenItemId,
          quantity: item.quantity,
          price: item.canteenItem.price,
          total: item.quantity * item.canteenItem.price,
        })),
      });
    });

    res.json({
      razorpay: {
        orderId: razorpayOrder.id,
        key: process.env.RAZORPAY_KEY_ID,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
      },
    });
  } catch (error) {
    console.error("Room pay create failed:", error);
    res.status(500).json({ error: "Failed to create room payment" });
  }
});

router.post("/:code/pay/verify", async (req, res) => {
  if (!isRazorpayReady()) {
    return res.status(500).json({ error: "Razorpay keys not configured" });
  }

  const code = String(req.params.code || "").trim().toUpperCase();
  const studentId = parseId(req.body.studentId);
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!code) {
    return res.status(400).json({ error: "code is required" });
  }
  if (studentId === null) {
    return res.status(400).json({ error: "studentId must be an integer" });
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
    const room = await prisma.room.findUnique({
      where: { code },
      include: { members: true },
    });
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    if (room.status !== "OPEN") {
      return res.status(400).json({ error: "Room is not open" });
    }
    if (room.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: "Room expired" });
    }

    const member = room.members.find((m) => m.studentId === studentId);
    if (!member) {
      return res.status(404).json({ error: "Member not found in room" });
    }
    if (member.razorpayOrderId !== razorpay_order_id) {
      return res.status(400).json({ error: "Order id mismatch" });
    }

    const updatedMember = await prisma.roomMember.update({
      where: { id: member.id },
      data: { status: "PAID", paymentId: razorpay_payment_id },
    });

    const members = await prisma.roomMember.findMany({
      where: { roomId: room.id },
    });
    const allPaid = members.every((m) => m.status === "PAID");

    let order = null;
    if (allPaid) {
      const existing = await prisma.order.findUnique({
        where: { roomId: room.id },
        include: { items: true },
      });
      if (existing) {
        return res.json({
          status: "verified",
          member: {
            id: updatedMember.id,
            status: updatedMember.status,
          },
          allPaid,
          order: existing,
        });
      }

      const mergedItems = await buildMergedItems(room.id);
      if (mergedItems.length === 0) {
        return res.status(400).json({ error: "No items to create order" });
      }

      const total = members.reduce((sum, m) => sum + (m.amount || 0), 0);

      try {
        order = await prisma.$transaction(async (tx) => {
          const created = await tx.order.create({
            data: {
              orderId: `room_${room.id}_${Date.now()}`,
              status: "PAID",
              total,
              currency: "INR",
              canteenId: room.canteenId,
              roomId: room.id,
              items: { create: mergedItems },
            },
            include: { items: true },
          });

          await tx.room.update({
            where: { id: room.id },
            data: { status: "ORDERED" },
          });

          return created;
        });
      } catch (error) {
        if (error.code === "P2002") {
          order = await prisma.order.findUnique({
            where: { roomId: room.id },
            include: { items: true },
          });
        } else {
          throw error;
        }
      }

      if (order) {
        await assignTokenAndQueue(order.id);
      }
    }

    res.json({
      status: "verified",
      member: {
        id: updatedMember.id,
        status: updatedMember.status,
      },
      allPaid,
      order,
    });
  } catch (error) {
    console.error("Room pay verify failed:", error);
    res.status(500).json({ error: "Failed to verify room payment" });
  }
});

module.exports = router;
