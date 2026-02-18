const crypto = require("crypto");
const express = require("express");
const Razorpay = require("razorpay");
const prisma = require("../../lib/prisma");

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

router.post("/create", async (req, res) => {
  const razorpay = getRazorpay();
  if (!razorpay) {
    return res.status(500).json({ error: "Razorpay keys not configured" });
  }

  const studentId = parseId(req.body.studentId);
  if (studentId === null) {
    return res.status(400).json({ error: "studentId must be an integer" });
  }

  try {
    const cart = await prisma.cart.findUnique({ where: { studentId } });
    if (!cart) {
      return res.status(404).json({ error: "Cart not found" });
    }

    const { total, items } = await calculateCartTotal(cart.id);
    if (items.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    const amountPaise = Math.round(total * 100);
    const razorpayOrder = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: `cart_${cart.id}_${Date.now()}`,
    });

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderId: razorpayOrder.id,
          status: "CREATED",
          total,
          currency: "INR",
          studentId,
          canteenId: cart.canteenId,
          items: {
            create: items.map((item) => ({
              canteenItemId: item.canteenItemId,
              quantity: item.quantity,
              price: item.canteenItem.price,
              total: item.quantity * item.canteenItem.price,
            })),
          },
        },
        include: { items: true },
      });

      await tx.cart.update({ where: { id: cart.id }, data: { total } });
      return created;
    });

    res.status(201).json({
      order,
      razorpay: {
        orderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
      },
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
    res.json({ status: "verified", order: updated });
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
      where: { studentId },
      orderBy: { id: "desc" },
      include: {
        canteen: true,
        items: { include: { canteenItem: true } },
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
        items: { include: { canteenItem: true } },
      },
    });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

module.exports = router;
