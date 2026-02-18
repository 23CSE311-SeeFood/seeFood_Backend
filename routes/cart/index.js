const express = require("express");
const prisma = require("../../lib/prisma");

const router = express.Router();

function parseId(value) {
  const num = Number(value);
  return Number.isInteger(num) ? num : null;
}

async function recalculateTotal(cartId) {
  const items = await prisma.cartItem.findMany({
    where: { cartId },
    include: { canteenItem: true },
  });
  const total = items.reduce(
    (sum, item) => sum + item.quantity * item.canteenItem.price,
    0
  );
  await prisma.cart.update({ where: { id: cartId }, data: { total } });
  return total;
}

async function getCartByStudentId(studentId) {
  return prisma.cart.findUnique({
    where: { studentId },
    include: {
      items: {
        include: { canteenItem: true },
        orderBy: { id: "asc" },
      },
      canteen: true,
    },
  });
}

router.get("/:studentId", async (req, res) => {
  try {
    const studentId = parseId(req.params.studentId);
    if (studentId === null) {
      return res.status(400).json({ error: "studentId must be an integer" });
    }

    const cart = await getCartByStudentId(studentId);
    if (!cart) {
      return res.status(404).json({ error: "Cart not found" });
    }

    res.json(cart);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch cart" });
  }
});

router.post("/:studentId/items", async (req, res) => {
  try {
    const studentId = parseId(req.params.studentId);
    if (studentId === null) {
      return res.status(400).json({ error: "studentId must be an integer" });
    }

    const { canteenId, canteenItemId, quantity } = req.body;
    const parsedCanteenId = parseId(canteenId);
    const parsedItemId = parseId(canteenItemId);
    const qty = quantity === undefined ? 1 : Number(quantity);

    if (parsedCanteenId === null) {
      return res.status(400).json({ error: "canteenId must be an integer" });
    }
    if (parsedItemId === null) {
      return res.status(400).json({ error: "canteenItemId must be an integer" });
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      return res.status(400).json({ error: "quantity must be a positive integer" });
    }

    const canteenItem = await prisma.canteenItem.findUnique({
      where: { id: parsedItemId },
    });
    if (!canteenItem || canteenItem.canteenId !== parsedCanteenId) {
      return res.status(404).json({ error: "Canteen item not found" });
    }

    const cart = await prisma.cart.upsert({
      where: { studentId },
      update: {
        canteenId: parsedCanteenId,
      },
      create: {
        studentId,
        canteenId: parsedCanteenId,
        total: 0,
      },
    });

    await prisma.cartItem.upsert({
      where: {
        cartId_canteenItemId: {
          cartId: cart.id,
          canteenItemId: parsedItemId,
        },
      },
      update: {
        quantity: { increment: qty },
      },
      create: {
        cartId: cart.id,
        canteenItemId: parsedItemId,
        quantity: qty,
      },
    });

    await recalculateTotal(cart.id);
    const cartWithItems = await getCartByStudentId(studentId);
    res.status(201).json(cartWithItems);
  } catch (error) {
    res.status(500).json({ error: "Failed to add cart item" });
  }
});

router.put("/:studentId/items/:itemId", async (req, res) => {
  try {
    const studentId = parseId(req.params.studentId);
    const itemId = parseId(req.params.itemId);
    const { quantity } = req.body;

    if (studentId === null) {
      return res.status(400).json({ error: "studentId must be an integer" });
    }
    if (itemId === null) {
      return res.status(400).json({ error: "itemId must be an integer" });
    }

    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      return res.status(400).json({ error: "quantity must be a positive integer" });
    }

    const cart = await prisma.cart.findUnique({ where: { studentId } });
    if (!cart) {
      return res.status(404).json({ error: "Cart not found" });
    }

    const result = await prisma.cartItem.updateMany({
      where: { cartId: cart.id, canteenItemId: itemId },
      data: { quantity: qty },
    });
    if (result.count === 0) {
      return res.status(404).json({ error: "Cart item not found" });
    }

    await recalculateTotal(cart.id);
    const cartWithItems = await getCartByStudentId(studentId);
    res.json(cartWithItems);
  } catch (error) {
    res.status(500).json({ error: "Failed to update cart item" });
  }
});

router.delete("/:studentId/items/:itemId", async (req, res) => {
  try {
    const studentId = parseId(req.params.studentId);
    const itemId = parseId(req.params.itemId);

    if (studentId === null) {
      return res.status(400).json({ error: "studentId must be an integer" });
    }
    if (itemId === null) {
      return res.status(400).json({ error: "itemId must be an integer" });
    }

    const cart = await prisma.cart.findUnique({ where: { studentId } });
    if (!cart) {
      return res.status(404).json({ error: "Cart not found" });
    }

    const result = await prisma.cartItem.deleteMany({
      where: { cartId: cart.id, canteenItemId: itemId },
    });
    if (result.count === 0) {
      return res.status(404).json({ error: "Cart item not found" });
    }

    await recalculateTotal(cart.id);
    const cartWithItems = await getCartByStudentId(studentId);
    res.json(cartWithItems);
  } catch (error) {
    res.status(500).json({ error: "Failed to delete cart item" });
  }
});

router.delete("/:studentId", async (req, res) => {
  try {
    const studentId = parseId(req.params.studentId);
    if (studentId === null) {
      return res.status(400).json({ error: "studentId must be an integer" });
    }

    const cart = await prisma.cart.findUnique({ where: { studentId } });
    if (!cart) {
      return res.status(404).json({ error: "Cart not found" });
    }

    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await prisma.cart.delete({ where: { id: cart.id } });

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: "Failed to clear cart" });
  }
});

router.post("/:studentId/sync", async (req, res) => {
  try {
    const studentId = parseId(req.params.studentId);
    if (studentId === null) {
      return res.status(400).json({ error: "studentId must be an integer" });
    }

    const { canteenId, items } = req.body;
    const parsedCanteenId = parseId(canteenId);
    if (parsedCanteenId === null) {
      return res.status(400).json({ error: "canteenId must be an integer" });
    }
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: "items must be an array" });
    }

    const normalized = [];
    for (const item of items) {
      const canteenItemId = parseId(item?.canteenItemId);
      const quantity = Number(item?.quantity);
      if (canteenItemId === null || !Number.isInteger(quantity) || quantity <= 0) {
        return res
          .status(400)
          .json({ error: "Each item requires canteenItemId and quantity" });
      }
      normalized.push({ canteenItemId, quantity });
    }

    const itemIds = normalized.map((item) => item.canteenItemId);
    if (itemIds.length > 0) {
      const dbItems = await prisma.canteenItem.findMany({
        where: { id: { in: itemIds }, canteenId: parsedCanteenId },
      });
      if (dbItems.length !== itemIds.length) {
        return res.status(400).json({ error: "Invalid canteen items" });
      }
    }

    await prisma.$transaction(async (tx) => {
      const existing = await tx.cart.findUnique({ where: { studentId } });
      let cart;
      if (!existing) {
        cart = await tx.cart.create({
          data: { studentId, canteenId: parsedCanteenId, total: 0 },
        });
      } else {
        cart = await tx.cart.update({
          where: { id: existing.id },
          data: { canteenId: parsedCanteenId },
        });
      }

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      if (normalized.length > 0) {
        await tx.cartItem.createMany({
          data: normalized.map((item) => ({
            cartId: cart.id,
            canteenItemId: item.canteenItemId,
            quantity: item.quantity,
          })),
        });
      }
    });

    const cart = await prisma.cart.findUnique({ where: { studentId } });
    if (!cart) {
      return res.status(404).json({ error: "Cart not found" });
    }
    await recalculateTotal(cart.id);

    const cartWithItems = await getCartByStudentId(studentId);
    res.json(cartWithItems);
  } catch (error) {
    res.status(500).json({ error: "Failed to sync cart" });
  }
});

module.exports = router;
