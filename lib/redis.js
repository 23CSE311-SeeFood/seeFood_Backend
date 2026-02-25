const { createClient } = require("redis");

const url = process.env.REDIS_URL || "redis://localhost:6379";
const client = createClient({ url });

client.on("error", (err) => {
  console.error("Redis client error:", err);
});

let connecting = null;

async function getRedis() {
  if (!client.isOpen) {
    if (!connecting) {
      connecting = client.connect();
    }
    await connecting;
  }
  return client;
}

async function disconnectRedis() {
  if (client.isOpen) {
    await client.quit();
  }
}

module.exports = { getRedis, disconnectRedis };
