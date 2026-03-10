const crypto = require("crypto");
const express = require("express");
const Razorpay = require("razorpay");
const { DateTime } = require("luxon");
const { Prisma } = require("@prisma/client");
const prisma = require("../../lib/prisma");
const { assignTokenAndQueue } = require("../orders");
const { enqueueOrderConfirmationEmail } = require("../../emails/emailQueue");
const { clearCartItemsForStudent } = require("../../lib/cart");

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
const CANTEEN_TIMEZONE = process.env.CANTEEN_TIMEZONE || "Asia/Kolkata";

function getSlotBounds(dateTime) {
  const open = dateTime.set({
    hour: OPEN_HOUR,
    minute: 0,
    second: 0,
    millisecond: 0,
  });
  const close = dateTime.set({
    hour: CLOSE_HOUR,
    minute: 0,
    second: 0,
    millisecond: 0,
  });
  return { open, close };
}

function getSlotEnd(slotStart) {
  return slotStart.plus({ minutes: SLOT_MINUTES });
}

function isAlignedToSlot(date) {
  return date.minute % SLOT_MINUTES === 0 && date.second === 0 && date.millisecond === 0;
}

function isSameDay(a, b) {
  return a.hasSame(b, "day");
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

async function countSlotUsage(
  canteenId,
  slotStart,
  excludePrebookId = null,
  db = prisma
) {
  const now = new Date();
  const prebookWhere = {
    canteenId,
    slotStart,
    OR: [
      { status: "CONFIRMED" },
      { status: "PROCESSING" },
      { status: "PENDING_PAYMENT", expiresAt: { gt: now } },
    ],
  };
  if (excludePrebookId) {
    prebookWhere.NOT = { id: excludePrebookId };
  }

  const [prebookCount, orderCount] = await Promise.all([
    db.prebook.count({ where: prebookWhere }),
    db.order.count({
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

  const date = DateTime.fromISO(dateStr, { zone: CANTEEN_TIMEZONE }).startOf("day");
  if (!date.isValid) {
    return res.status(400).json({ error: "invalid date" });
  }

  const today = DateTime.now().setZone(CANTEEN_TIMEZONE);
  if (!isSameDay(date, today)) {
    return res.status(400).json({ error: "only same-day slots are supported" });
  }

  const { open, close } = getSlotBounds(date);
  const slots = [];

  for (let cursor = open; cursor.plus({ minutes: SLOT_MINUTES }) <= close; cursor = cursor.plus({ minutes: SLOT_MINUTES })) {
    slots.push(cursor);
  }

  try {
    const usage = await Promise.all(
      slots.map((slotStart) => countSlotUsage(canteenId, slotStart.toJSDate()))
    );

    res.json({
      date: dateStr,
      canteenId,
      slotMinutes: SLOT_MINUTES,
      capacity: MAX_ORDERS_PER_SLOT,
      workingHours: { openHour: OPEN_HOUR, closeHour: CLOSE_HOUR },
      slots: slots.map((slotStart, idx) => ({
        start: slotStart.toISO(),
        end: getSlotEnd(slotStart).toISO(),
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

  const slotStart = DateTime.fromISO(req.body.slotStart, { zone: CANTEEN_TIMEZONE });
  if (!slotStart.isValid) {
    return res.status(400).json({ error: "slotStart is required (ISO string)" });
  }

  const now = DateTime.now().setZone(CANTEEN_TIMEZONE);
  if (!isSameDay(slotStart, now)) {
    return res.status(400).json({ error: "slot must be for today" });
  }
  if (!isAlignedToSlot(slotStart)) {
    return res.status(400).json({ error: "slotStart must align to slot duration" });
  }
  const { open, close } = getSlotBounds(slotStart);
  const slotEnd = getSlotEnd(slotStart);
  const slotStartDate = slotStart.toJSDate();
  const slotEndDate = slotEnd.toJSDate();
  if (slotStart < open || slotEnd > close) {
    return res.status(400).json({ error: "slot is outside working hours" });
  }
  if (slotStart.toMillis() < now.toMillis()) {
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

    const amountPaise = Math.round(result.total * 100);
    const razorpayOrder = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: `prebook_${Date.now()}`,
    });

    const expiresAt = new Date(
      Date.now() + RESERVATION_MINUTES * 60 * 1000
    );

    let prebook = null;
    try {
      prebook = await prisma.$transaction(
        async (tx) => {
          const used = await countSlotUsage(
            cart.canteenId,
            slotStartDate,
            null,
            tx
          );
          if (used >= MAX_ORDERS_PER_SLOT) {
            throw new Error("SLOT_FULL");
          }
          return tx.prebook.create({
            data: {
              studentId,
              canteenId: cart.canteenId,
              slotStart: slotStartDate,
              slotEnd: slotEndDate,
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
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (error) {
      if (error.message === "SLOT_FULL") {
        return res.status(409).json({ error: "Slot is full" });
      }
      throw error;
    }

    res.status(201).json({
      prebookId: prebook.id,
      slotStart: slotStart.toISO(),
      slotEnd: slotEnd.toISO(),
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
    const result = await prisma.$transaction(
      async (tx) => {
        const now = new Date();
        const claim = await tx.prebook.updateMany({
          where: { id: prebookId, status: "PENDING_PAYMENT" },
          data: { status: "PROCESSING" },
        });

        if (claim.count === 0) {
          const existing = await tx.order.findUnique({
            where: { orderId: razorpay_order_id },
            include: { items: true },
          });
          return { alreadyProcessed: true, order: existing };
        }

        const prebook = await tx.prebook.findUnique({
          where: { id: prebookId },
          include: { items: { include: { canteenItem: true } }, student: true, canteen: true },
        });
        if (!prebook) {
          return { error: "PREBOOK_NOT_FOUND" };
        }
        if (prebook.razorpayOrderId !== razorpay_order_id) {
          await tx.prebook.update({
            where: { id: prebookId },
            data: { status: "PENDING_PAYMENT" },
          });
          return { error: "ORDER_ID_MISMATCH" };
        }
        if (prebook.expiresAt.getTime() < now.getTime()) {
          await tx.prebook.update({
            where: { id: prebookId },
            data: { status: "EXPIRED" },
          });
          return { error: "PREBOOK_EXPIRED" };
        }

        const used = await countSlotUsage(
          prebook.canteenId,
          prebook.slotStart,
          prebook.id,
          tx
        );
        if (used >= MAX_ORDERS_PER_SLOT) {
          await tx.prebook.update({
            where: { id: prebookId },
            data: { status: "CANCELLED" },
          });
          return { error: "SLOT_FULL" };
        }

        const order = await tx.order.create({
          data: {
            orderId: razorpay_order_id,
            transactionId: razorpay_payment_id,
            status: "PAID",
            total: Number(prebook.total),
            currency: prebook.currency,
            studentId: prebook.studentId,
            canteenId: prebook.canteenId,
            isPrebooked: true,
            scheduledFor: prebook.slotStart,
            items: {
              create: prebook.items.map((item) => ({
                canteenItemId: item.canteenItemId,
                quantity: item.quantity,
                price: Number(item.price),
                total: Number(item.total),
              })),
            },
          },
          include: { items: true },
        });

        await tx.prebook.update({
          where: { id: prebookId },
          data: { status: "CONFIRMED" },
        });

        const itemIds = prebook.items.map((item) => item.canteenItemId);
        await clearCartItemsForStudent(tx, prebook.studentId, itemIds);

        return { order, prebook };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    if (result.alreadyProcessed) {
      if (result.order) {
        return res.json({ status: "verified", order: result.order });
      }
      return res.status(409).json({ error: "Prebook already processed" });
    }
    if (result.error) {
      if (result.error === "PREBOOK_NOT_FOUND") {
        return res.status(404).json({ error: "Prebook not found" });
      }
      if (result.error === "ORDER_ID_MISMATCH") {
        return res.status(400).json({ error: "Order id mismatch" });
      }
      if (result.error === "PREBOOK_EXPIRED") {
        return res.status(400).json({ error: "Prebook expired" });
      }
      if (result.error === "SLOT_FULL") {
        return res.status(409).json({ error: "Slot is full" });
      }
      return res.status(400).json({ error: "Prebook failed" });
    }

    const created = result.order;
    const prebook = result.prebook;

    let tokenNumber = null;
    const dueTime = new Date(Date.now() + LEAD_MINUTES * 60 * 1000);
    if (created.scheduledFor && created.scheduledFor <= dueTime) {
      tokenNumber = await assignTokenAndQueue(created.id);
    }

    if (prebook.student?.email) {
      try {
        await enqueueOrderConfirmationEmail({
          to: prebook.student.email,
          name: prebook.student.name,
          orderId: created.orderId,
          canteenName: prebook.canteen?.name || null,
          items: prebook.items.map((item) => ({
            name: item.canteenItem?.name || "Item",
            quantity: item.quantity,
            total: Number(item.total),
          })),
          total: created.total,
          tokenNumber,
          scheduledFor: created.scheduledFor,
        });
      } catch (emailError) {
        console.error("Prebook order email failed:", emailError);
      }
    }

    res.json({ status: "verified", order: { ...created, tokenNumber } });
  } catch (error) {
    console.error("Prebook verify failed:", error);
    res.status(500).json({ error: "Failed to verify prebook" });
  }
});

module.exports = router;
