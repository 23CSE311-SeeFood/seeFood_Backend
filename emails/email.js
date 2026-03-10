const { EmailClient } = require("@azure/communication-email");

const connectionString = process.env.AZURE_EMAIL_CONNECTION_STRING;
const senderAddress = process.env.AZURE_EMAIL_SENDER;
let client = null;

function getEmailClient() {
  if (!connectionString || !senderAddress) return null;
  if (!client) {
    client = new EmailClient(connectionString);
  }
  return client;
}

function formatMoney(value) {
  const num = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(num)) return "-";
  return `₹${num.toFixed(2)}`;
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildItemsHtml(items = []) {
  if (!items.length) return "<p>No items</p>";
  const rows = items
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;">${escapeHtml(
          item.name
        )}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;text-align:center;">${item.quantity}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;text-align:right;">${formatMoney(item.total)}</td>
      </tr>
    `
    )
    .join("");
  return `
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <thead>
        <tr style="text-align:left;color:#555;">
          <th style="padding-bottom:6px;">Item</th>
          <th style="padding-bottom:6px;text-align:center;">Qty</th>
          <th style="padding-bottom:6px;text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function buildOrderEmail({ name, orderId, canteenName, items, total, tokenNumber, scheduledFor }) {
  const greeting = name ? `Hi ${escapeHtml(name)},` : "Hi,";
  const safeOrderId = escapeHtml(orderId);
  const safeCanteen = escapeHtml(canteenName || "-");
  const tokenLine = tokenNumber ? `<strong>Token:</strong> ${tokenNumber}` : "";
  const scheduleLine = scheduledFor
    ? `<strong>Pickup Time:</strong> ${new Date(scheduledFor).toLocaleString()}`
    : "";
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;background:#f6f7fb;padding:24px;">
      <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px;border:1px solid #e9e9e9;">
        <h2 style="margin:0 0 8px;color:#1f2937;">Order Confirmed</h2>
        <p style="margin:0 0 16px;color:#4b5563;">${greeting} your order has been placed successfully.</p>
        <div style="background:#f9fafb;border-radius:10px;padding:16px;margin-bottom:16px;">
          <p style="margin:0 0 6px;"><strong>Order ID:</strong> ${safeOrderId}</p>
          <p style="margin:0 0 6px;"><strong>Canteen:</strong> ${safeCanteen}</p>
          ${tokenLine ? `<p style="margin:0 0 6px;">${tokenLine}</p>` : ""}
          ${scheduleLine ? `<p style="margin:0;">${scheduleLine}</p>` : ""}
        </div>
        ${buildItemsHtml(items)}
        <div style="display:flex;justify-content:space-between;margin-top:16px;padding-top:12px;border-top:1px solid #f0f0f0;">
          <strong>Total</strong>
          <strong>${formatMoney(total)}</strong>
        </div>
        <p style="margin-top:20px;color:#6b7280;font-size:12px;">
          If you have any questions, reply to this email.
        </p>
      </div>
    </div>
  `;
}

async function sendOrderConfirmationEmail({
  to,
  name,
  orderId,
  canteenName,
  items,
  total,
  tokenNumber,
  scheduledFor,
}) {
  const clientInstance = getEmailClient();
  if (!clientInstance) {
    throw new Error("Email client not configured");
  }

  const html = buildOrderEmail({
    name,
    orderId,
    canteenName,
    items,
    total,
    tokenNumber,
    scheduledFor,
  });

  const emailMessage = {
    senderAddress,
    content: {
      subject: "Your order is confirmed",
      plainText: `Your order ${orderId} is confirmed.`,
      html,
    },
    recipients: {
      to: [{ address: to }],
    },
  };

  const poller = await clientInstance.beginSend(emailMessage);
  await poller.pollUntilDone();
}

module.exports = { sendOrderConfirmationEmail };
