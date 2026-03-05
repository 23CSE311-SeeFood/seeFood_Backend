const { WebSocketServer } = require("ws");
const { URL } = require("url");
const { getRedis } = require("./redis");
const prisma = require("./prisma");

const canteenClients = new Map();
const roomClients = new Map();
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

function addRoomClient(code, ws) {
  const key = String(code).toUpperCase();
  if (!roomClients.has(key)) {
    roomClients.set(key, new Set());
  }
  roomClients.get(key).add(ws);
}

function removeRoomClient(code, ws) {
  const key = String(code).toUpperCase();
  const set = roomClients.get(key);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) roomClients.delete(key);
}

function broadcastToRoom(code, payload) {
  const key = String(code).toUpperCase();
  const set = roomClients.get(key);
  if (!set) return;
  const message = JSON.stringify(payload);
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) {
      ws.send(message);
    }
  }
}

async function getRoomSnapshot(code) {
  const room = await prisma.room.findUnique({
    where: { code: String(code).toUpperCase() },
    include: {
      members: { include: { student: true } },
      canteen: true,
      orders: { select: { id: true } },
    },
  });
  if (!room) return null;

  const members = room.members.map((member) => ({
    id: member.id,
    studentId: member.studentId,
    name: member.student?.name || null,
    status: member.status,
    amount: member.amount,
  }));

  const allPaid = members.length > 0 && members.every((m) => m.status === "PAID");

  return {
    id: room.id,
    code: room.code,
    status: room.status,
    canteenId: room.canteenId,
    expiresAt: room.expiresAt,
    members,
    allPaid,
    orderId: room.orders[0]?.id || null,
  };
}

function attachWebSocket(server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url, "http://localhost");
    const canteenId = url.searchParams.get("canteenId");
    const roomCode = url.searchParams.get("roomCode");
    if (!canteenId && !roomCode) {
      ws.close(1008, "canteenId or roomCode required");
      return;
    }

    if (canteenId) {
      addClient(canteenId, ws);
      console.log(`WS client connected: canteenId=${canteenId}`);
    } else {
      addRoomClient(roomCode, ws);
      console.log(`WS client connected: roomCode=${roomCode}`);
    }

    try {
      if (canteenId) {
        const snapshot = await getQueueSnapshot(canteenId);
        ws.send(
          JSON.stringify({
            type: "queue_snapshot",
            canteenId: String(canteenId),
            dateKey: snapshot.dateKey,
            queues: snapshot.queues,
          })
        );
      } else if (roomCode) {
        const snapshot = await getRoomSnapshot(roomCode);
        if (snapshot) {
          ws.send(
            JSON.stringify({
              type: "room_snapshot",
              room: snapshot,
            })
          );
        }
      }
    } catch (error) {
      console.error("WS snapshot error:", error);
    }

    ws.on("close", () => {
      if (canteenId) {
        removeClient(canteenId, ws);
        console.log(`WS client disconnected: canteenId=${canteenId}`);
      } else if (roomCode) {
        removeRoomClient(roomCode, ws);
        console.log(`WS client disconnected: roomCode=${roomCode}`);
      }
    });
  });

  return wss;
}

module.exports = {
  attachWebSocket,
  broadcastToCanteen,
  broadcastToRoom,
  getRoomSnapshot,
};
