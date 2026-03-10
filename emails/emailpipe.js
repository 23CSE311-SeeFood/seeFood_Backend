require("dotenv").config();
const { ServiceBusClient } = require("@azure/service-bus");

const connectionString = process.env.SERVICEBUS_CONNECTION_STRING;
const queueName = process.env.SERVICEBUS_EMAIL_QUEUE || "emails";

async function sendTestMessage() {
  if (!connectionString) {
    throw new Error("SERVICEBUS_CONNECTION_STRING not set");
  }

  const client = new ServiceBusClient(connectionString);
  const sender = client.createSender(queueName);

  try {
    await sender.sendMessages({
      body: {
        type: "order_confirmation",
        payload: {
          to: "test@example.com",
          name: "Test",
          orderId: "test-order",
          canteenName: "Test Canteen",
          items: [{ name: "Test Item", quantity: 1, total: 100 }],
          total: 100,
          tokenNumber: 1,
          scheduledFor: null,
        },
      },
    });
  } finally {
    await sender.close();
    await client.close();
  }
}

module.exports = { sendTestMessage };
