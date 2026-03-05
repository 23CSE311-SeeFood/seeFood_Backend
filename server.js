require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const prisma = require("./lib/prisma");
const { disconnectRedis } = require("./lib/redis");
const { attachWebSocket } = require("./lib/ws");
const canteensRouter = require("./routes/canteens");
const itemsRouter = require("./routes/items");
const paymentsRouter = require("./routes/payments");
const authRouter = require("./routes/auth");
const cartRouter = require("./routes/cart");
const { router: ordersRouter } = require("./routes/orders");
const prebookRouter = require("./routes/prebook");
const roomsRouter = require("./routes/rooms");
const microsoftRouter = require("./routes/microsoft");

const app = express();
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:3001,http://localhost:5000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin: allowedOrigins,
  credentials: true,
};

app.use(cors(corsOptions));
const port = process.env.PORT || 3000;

app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  })
);
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Express server running" });
});

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

app.use("/canteens", canteensRouter);
app.use("/canteens/:canteenId/items", itemsRouter);
app.use("/payments", paymentsRouter);
app.use("/auth", authRouter);
app.use("/auth/microsoft", microsoftRouter);
app.use("/cart", cartRouter);
app.use("/orders", ordersRouter);
app.use("/prebook", prebookRouter);
app.use("/rooms", roomsRouter);

app.use((req, res) => {
  res.status(404).json({ error: "Not Found" });
});

const server = http.createServer(app);
attachWebSocket(server);

server.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on port ${port}`);
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  await disconnectRedis();
  process.exit(0);
});
