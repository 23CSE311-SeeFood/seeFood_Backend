const { createClient } = require("redis");

function envTruthy(value) {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function buildRedisClientOptions() {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl && String(redisUrl).trim()) {
    return { url: String(redisUrl).trim() };
  }

  const parsedPort = Number.parseInt(process.env.REDIS_PORT || "6379", 10);
  const port = Number.isInteger(parsedPort) ? parsedPort : 6379;
  const useTls = envTruthy(process.env.REDIS_TLS) || envTruthy(process.env.REDIS_USE_TLS);

  return {
    username: process.env.REDIS_USERNAME || "default",
    password: process.env.REDIS_PASSWORD,
    socket: {
      host: process.env.REDIS_HOST || "localhost",
      port,
      ...(useTls ? { tls: true } : {}),
      keepAlive: 30000,
      reconnectStrategy: (retries) => Math.min(retries * 100, 5000),
    },
  };
}

const client = createClient(buildRedisClientOptions());

client.on("error", (err) => {
  console.error("Redis client error:", err);
});

let connecting = null;

async function getRedis() {
  if (!client.isOpen) {
    if (!connecting) {
      connecting = client.connect();
    }
    try {
      await connecting;
    } catch (err) {
      connecting = null;
      throw err;
    } finally {
      if (client.isOpen) {
        connecting = null;
      }
    }
  }
  return client;
}

async function disconnectRedis() {
  if (client.isOpen) {
    await client.quit();
  }
}

module.exports = { getRedis, disconnectRedis };
