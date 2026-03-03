const { WebSocketServer } = require("ws");
const { URL } = require("url");
const { getRedis } = require("./redis");

const canteenClients = new Map();
const STATIONS = ["RICE", "CURRIES", "ICECREAM", "ROOTI", "DRINKS", "GENERAL"];

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

async function getQueueSnapshot(canteenId) {
  const redis = await getRedis();
  const dateKey = getDateKey();
  const queues = {};

  for (const station of STATIONS) {
    const queueKey = `queue:${canteenId}:${station}:${dateKey}`;
    const list = await redis.zRange(queueKey, 0, -1);
    queues[station] = list
      .map((entry, index) => {
        try {
          return { ...JSON.parse(entry), position: index + 1 };
        } catch {
          return { raw: entry, position: index + 1 };
        }
      })
      .filter(Boolean);
  }

  return { dateKey, queues };
}

function addClient(canteenId, ws) {
  const key = String(canteenId);
  if (!canteenClients.has(key)) {
    canteenClients.set(key, new Set());
  }
  canteenClients.get(key).add(ws);
}

function removeClient(canteenId, ws) {
  const key = String(canteenId);
  const set = canteenClients.get(key);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) canteenClients.delete(key);
}

function broadcastToCanteen(canteenId, payload) {
  const key = String(canteenId);
  const set = canteenClients.get(key);
  if (!set) return;
  const message = JSON.stringify(payload);
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) {
      ws.send(message);
    }
  }
}

function attachWebSocket(server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url, "http://localhost");
    const canteenId = url.searchParams.get("canteenId");
    if (!canteenId) {
      ws.close(1008, "canteenId required");
      return;
    }

    addClient(canteenId, ws);
    console.log(`WS client connected: canteenId=${canteenId}`);

    try {
      const snapshot = await getQueueSnapshot(canteenId);
      ws.send(
        JSON.stringify({
          type: "queue_snapshot",
          canteenId: String(canteenId),
          dateKey: snapshot.dateKey,
          queues: snapshot.queues,
        })
      );
    } catch (error) {
      console.error("WS snapshot error:", error);
    }

    ws.on("close", () => {
      removeClient(canteenId, ws);
      console.log(`WS client disconnected: canteenId=${canteenId}`);
    });
  });

  return wss;
}

module.exports = { attachWebSocket, broadcastToCanteen };
