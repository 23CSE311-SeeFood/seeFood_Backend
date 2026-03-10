const { ServiceBusClient } = require("@azure/service-bus");
const WebSocket = require("ws");
const { sendOrderConfirmationEmail } = require("./email");

const connectionString = process.env.SERVICEBUS_CONNECTION_STRING;
const queueName = process.env.SERVICEBUS_EMAIL_QUEUE || "emails";
let client = null;

function isQueueReady() {
  return Boolean(connectionString && queueName);
}

function getClient() {
  if (!isQueueReady()) return null;
  if (!client) {
    client = new ServiceBusClient(connectionString, {
      webSocketOptions: {
        webSocket: WebSocket,
      },
    });
  }
  return client;
}

async function enqueueEmail(message) {
  const clientInstance = getClient();
  if (!clientInstance) {
    throw new Error("Service Bus not configured");
  }
  const sender = clientInstance.createSender(queueName);
  try {
    await sender.sendMessages({ body: message });
  } finally {
    await sender.close();
  }
}

async function enqueueOrderConfirmationEmail(payload) {
  if (!isQueueReady()) {
    await sendOrderConfirmationEmail(payload);
    return;
  }
  await enqueueEmail({ type: "order_confirmation", payload });
}

async function startEmailWorker() {
  const clientInstance = getClient();
  if (!clientInstance) {
    throw new Error("Service Bus not configured");
  }
  const receiver = clientInstance.createReceiver(queueName);

  receiver.subscribe({
    processMessage: async (message) => {
      console.log("Processing message:", message.body);
      if (!message?.body) return;
      const { type, payload } = message.body;
      if (type === "order_confirmation") {
        console.log("Sending order confirmation email");
        await sendOrderConfirmationEmail(payload);
        console.log("Email sent successfully");
      }
    },
    processError: async (error) => {
      console.error("Email worker error:", error);
    },
  });

  return {
    close: async () => {
      await receiver.close();
      await clientInstance.close();
    },
  };
}

module.exports = {
  enqueueOrderConfirmationEmail,
  startEmailWorker,
};
