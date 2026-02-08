const express = require("express");
const prisma = require("./lib/prisma");
const canteensRouter = require("./routes/canteens");
const itemsRouter = require("./routes/items");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Express server running" });
});

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

app.use("/canteens", canteensRouter);
app.use("/canteens/:canteenId/items", itemsRouter);

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
