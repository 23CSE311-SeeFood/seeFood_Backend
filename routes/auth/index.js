const bcrypt = require("bcryptjs");
const express = require("express");
const jwt = require("jsonwebtoken");
const prisma = require("../../lib/prisma");

const router = express.Router();

function requireJwtSecret(res) {
  if (!process.env.JWT_SECRET) {
    res.status(500).json({ error: "JWT secret not configured" });
    return false;
  }
  return true;
}

function signToken(user, role) {
  const secret = process.env.JWT_SECRET || "";
  return jwt.sign(
    { sub: user.id, email: user.email, role },
    secret,
    { expiresIn: "7d" }
  );
}

function sanitizeStudent(student) {
  const { password, ...rest } = student;
  return rest;
}

router.post("/register", async (req, res) => {
  const { name, email, number, password, branch, rollNumber } = req.body;

  if (!name || !email || !number || !password) {
    return res.status(400).json({ error: "name, email, number, password required" });
  }

  if (!requireJwtSecret(res)) return;

  try {
    const existing = await prisma.student.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "email already registered" });
    }

    const hash = await bcrypt.hash(password, 10);
    const student = await prisma.student.create({
      data: {
        name: String(name).trim(),
        email: String(email).trim().toLowerCase(),
        number: String(number).trim(),
        branch: branch ? String(branch).trim() : null,
        rollNumber: rollNumber ? String(rollNumber).trim() : null,
        password: hash,
      },
    });

    const token = signToken(student, "student");
    res.status(201).json({ token, student: sanitizeStudent(student) });
  } catch (error) {
    res.status(500).json({ error: "Failed to register" });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "email and password required" });
  }

  if (!requireJwtSecret(res)) return;

  try {
    const student = await prisma.student.findUnique({ where: { email } });
    if (!student) {
      return res.status(401).json({ error: "invalid credentials" });
    }

    const ok = await bcrypt.compare(password, student.password);
    if (!ok) {
      return res.status(401).json({ error: "invalid credentials" });
    }

    const token = signToken(student, "student");
    res.json({ token, student: sanitizeStudent(student) });
  } catch (error) {
    res.status(500).json({ error: "Failed to login" });
  }
});

router.post("/admin/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email, password required" });
  }

  if (!requireJwtSecret(res)) return;

  try {
    const existing = await prisma.admin.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "email already registered" });
    }

    const hash = await bcrypt.hash(password, 10);
    const admin = await prisma.admin.create({
      data: {
        name: String(name).trim(),
        email: String(email).trim().toLowerCase(),
        password: hash,
      },
    });

    const token = signToken(admin, "admin");
    const { password: _, ...safeAdmin } = admin;
    res.status(201).json({ token, admin: safeAdmin });
  } catch (error) {
    res.status(500).json({ error: "Failed to register admin" });
  }
});

router.post("/admin/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "email and password required" });
  }

  if (!requireJwtSecret(res)) return;

  try {
    const admin = await prisma.admin.findUnique({ where: { email } });
    if (!admin) {
      return res.status(401).json({ error: "invalid credentials" });
    }

    const ok = await bcrypt.compare(password, admin.password);
    if (!ok) {
      return res.status(401).json({ error: "invalid credentials" });
    }

    const token = signToken(admin, "admin");
    const { password: _, ...safeAdmin } = admin;
    res.json({ token, admin: safeAdmin });
  } catch (error) {
    res.status(500).json({ error: "Failed to login admin" });
  }
});

router.post("/cashier/register", async (req, res) => {
  const { name, email, password, canteenId } = req.body;
  const parsedCanteenId = Number(canteenId);
  if (!name || !email || !password || !Number.isInteger(parsedCanteenId)) {
    return res
      .status(400)
      .json({ error: "name, email, password, canteenId required" });
  }

  if (!requireJwtSecret(res)) return;

  try {
    const canteen = await prisma.canteen.findUnique({ where: { id: parsedCanteenId } });
    if (!canteen) {
      return res.status(404).json({ error: "Canteen not found" });
    }

    const existing = await prisma.cashier.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "email already registered" });
    }

    const hash = await bcrypt.hash(password, 10);
    const cashier = await prisma.cashier.create({
      data: {
        name: String(name).trim(),
        email: String(email).trim().toLowerCase(),
        password: hash,
        canteenId: parsedCanteenId,
      },
    });

    const token = signToken(cashier, "cashier");
    const { password: _, ...safeCashier } = cashier;
    res.status(201).json({ token, cashier: safeCashier });
  } catch (error) {
    res.status(500).json({ error: "Failed to register cashier" });
  }
});

router.post("/cashier/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "email and password required" });
  }

  if (!requireJwtSecret(res)) return;

  try {
    const cashier = await prisma.cashier.findUnique({ where: { email } });
    if (!cashier) {
      return res.status(401).json({ error: "invalid credentials" });
    }

    const ok = await bcrypt.compare(password, cashier.password);
    if (!ok) {
      return res.status(401).json({ error: "invalid credentials" });
    }

    const token = signToken(cashier, "cashier");
    const { password: _, ...safeCashier } = cashier;
    res.json({ token, cashier: safeCashier });
  } catch (error) {
    res.status(500).json({ error: "Failed to login cashier" });
  }
});

module.exports = router;
