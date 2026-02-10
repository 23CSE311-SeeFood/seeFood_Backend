// Main entry point for the Express server
const express = require("express");
const prisma = require("./lib/prisma");
const canteensRouter = require("./routes/canteens");
const itemsRouter = require("./routes/items");

const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());
// Middleware to parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));

// Root endpoint to verify server status
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Express server running" });
});

// Health check endpoint for monitoring
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// Register routes for canteens and nested items
app.use("/canteens", canteensRouter);
app.use("/canteens/:canteenId/items", itemsRouter);

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({ error: "Not Found" });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on port ${port}`);
});

// Graceful shutdown: disconnect Prisma when the process is interrupted
process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
