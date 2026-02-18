require("dotenv").config();
const express = require("express");
const cors = require("cors");
const prisma = require("./lib/prisma");
const canteensRouter = require("./routes/canteens");
const itemsRouter = require("./routes/items");
const paymentsRouter = require("./routes/payments");
const authRouter = require("./routes/auth");
const cartRouter = require("./routes/cart");
const ordersRouter = require("./routes/orders");

const app = express();
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:3001")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
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
app.use("/cart", cartRouter);
app.use("/orders", ordersRouter);

app.use((req, res) => {
  res.status(404).json({ error: "Not Found" });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on port ${port}`);
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
