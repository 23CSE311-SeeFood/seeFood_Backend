const express = require("express");
const prisma = require("../../lib/prisma");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const canteens = await prisma.canteen.findMany({
      orderBy: { id: "asc" },
    });
    res.json(canteens);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch canteens" });
  }
});

router.post("/", async (req, res) => {
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

router.delete("/:id", async (req, res) => {
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

module.exports = router;
