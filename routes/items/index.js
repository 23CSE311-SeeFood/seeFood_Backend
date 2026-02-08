const express = require("express");
const prisma = require("../../lib/prisma");

const router = express.Router({ mergeParams: true });

function parseId(value) {
  const num = Number(value);
  return Number.isInteger(num) ? num : null;
}

async function ensureCanteen(req, res) {
  const canteenId = parseId(req.params.canteenId);
  if (canteenId === null) {
    res.status(400).json({ error: "canteenId must be an integer" });
    return null;
  }

  const canteen = await prisma.canteen.findUnique({ where: { id: canteenId } });
  if (!canteen) {
    res.status(404).json({ error: "Canteen not found" });
    return null;
  }

  return canteenId;
}

router.get("/", async (req, res) => {
  try {
    const canteenId = await ensureCanteen(req, res);
    if (canteenId === null) return;

    const items = await prisma.canteenItem.findMany({
      where: { canteenId },
      orderBy: { id: "asc" },
    });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch items" });
  }
});

router.post("/", async (req, res) => {
  try {
    const canteenId = await ensureCanteen(req, res);
    if (canteenId === null) return;

    const { name, price, rating, isVeg } = req.body;
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "name is required" });
    }
    if (price === undefined || Number.isNaN(Number(price))) {
      return res.status(400).json({ error: "price is required" });
    }
    if (typeof isVeg !== "boolean") {
      return res.status(400).json({ error: "isVeg must be boolean" });
    }

    const created = await prisma.canteenItem.create({
      data: {
        name: name.trim(),
        price: Number(price),
        rating: rating === undefined ? null : Number(rating),
        isVeg,
        canteenId,
      },
    });
    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ error: "Failed to create item" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const canteenId = await ensureCanteen(req, res);
    if (canteenId === null) return;

    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: "id must be an integer" });
    }

    const { name, price, rating, isVeg } = req.body;
    const data = {};
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "name must be a non-empty string" });
      }
      data.name = name.trim();
    }
    if (price !== undefined) {
      if (Number.isNaN(Number(price))) {
        return res.status(400).json({ error: "price must be a number" });
      }
      data.price = Number(price);
    }
    if (rating !== undefined) {
      if (Number.isNaN(Number(rating))) {
        return res.status(400).json({ error: "rating must be a number" });
      }
      data.rating = Number(rating);
    }
    if (isVeg !== undefined) {
      if (typeof isVeg !== "boolean") {
        return res.status(400).json({ error: "isVeg must be boolean" });
      }
      data.isVeg = isVeg;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "no fields to update" });
    }

    const result = await prisma.canteenItem.updateMany({
      where: { id, canteenId },
      data,
    });

    if (result.count === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    const updated = await prisma.canteenItem.findUnique({ where: { id } });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Failed to update item" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const canteenId = await ensureCanteen(req, res);
    if (canteenId === null) return;

    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: "id must be an integer" });
    }

    const result = await prisma.canteenItem.deleteMany({
      where: { id, canteenId },
    });

    if (result.count === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: "Failed to delete item" });
  }
});

module.exports = router;
