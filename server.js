const express = require("express");
const { PrismaClient } = require("@prisma/client");

const app = express();
const port = process.env.PORT || 3000;
const prisma = new PrismaClient();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Express server running" });
});

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

app.get("/canteens", async (req, res) => {
  try {
    const canteens = await prisma.canteen.findMany({
      orderBy: { id: "asc" },
    });
    res.json(canteens);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch canteens" });
  }
});

app.post("/canteens", async (req, res) => {
  const { name, ratings } = req.body;
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "name is required" });
  }

  try {
    const created = await prisma.canteen.create({
      data: {
        name: name.trim(),
        ratings: ratings === undefined ? null : Number(ratings),
      },
    });
    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ error: "Failed to create canteen" });
  }
});

app.delete("/canteens/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "id must be an integer" });
  }

  try {
    await prisma.canteen.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    res.status(404).json({ error: "Canteen not found" });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "Not Found" });
});

app.listen(3000, '0.0.0.0', () => console.log('Server running'));

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
