const { WebSocketServer } = require("ws");
const { URL } = require("url");

const canteenClients = new Map();

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

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url, "http://localhost");
    const canteenId = url.searchParams.get("canteenId");
    if (!canteenId) {
      ws.close(1008, "canteenId required");
      return;
    }

    addClient(canteenId, ws);

    ws.on("close", () => {
      removeClient(canteenId, ws);
    });
  });

  return wss;
}

module.exports = { attachWebSocket, broadcastToCanteen };
