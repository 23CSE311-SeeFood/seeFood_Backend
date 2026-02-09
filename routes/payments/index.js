const crypto = require("crypto");
const express = require("express");
const Razorpay = require("razorpay");

const router = express.Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "",
});

function isRazorpayReady() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

router.post("/create-order", async (req, res) => {
  if (!isRazorpayReady()) {
    return res.status(500).json({ error: "Razorpay keys not configured" });
  }

  const { amount, currency = "INR", receipt, notes } = req.body;
  if (amount === undefined || Number.isNaN(Number(amount))) {
    return res.status(400).json({ error: "amount is required" });
  }

  try {
    const order = await razorpay.orders.create({
      amount: Math.round(Number(amount)),
      currency,
      receipt,
      notes,
    });
    res.status(201).json(order);
  } catch (error) {
    res.status(500).json({ error: "Failed to create order" });
  }
});

router.post("/verify", (req, res) => {
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

  const isValid = expected === razorpay_signature;
  if (!isValid) {
    return res.status(400).json({ error: "Invalid signature" });
  }

  res.json({ status: "verified" });
});

router.post("/webhook", (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(500).json({ error: "Webhook secret not configured" });
  }

  const signature = req.headers["x-razorpay-signature"];
  if (!signature || typeof signature !== "string") {
    return res.status(400).json({ error: "Missing signature" });
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(req.rawBody || "")
    .digest("hex");

  if (expected !== signature) {
    return res.status(400).json({ error: "Invalid webhook signature" });
  }

  res.status(200).json({ status: "ok" });
});

module.exports = router;
