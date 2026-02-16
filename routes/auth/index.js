const bcrypt = require("bcryptjs");
const express = require("express");
const jwt = require("jsonwebtoken");
const prisma = require("../../lib/prisma");

const router = express.Router();

function signToken(student) {
  const secret = process.env.JWT_SECRET || "";
  return jwt.sign(
    { sub: student.id, email: student.email },
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

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ error: "JWT secret not configured" });
  }

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

    const token = signToken(student);
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

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ error: "JWT secret not configured" });
  }

  try {
    const student = await prisma.student.findUnique({ where: { email } });
    if (!student) {
      return res.status(401).json({ error: "invalid credentials" });
    }

    const ok = await bcrypt.compare(password, student.password);
    if (!ok) {
      return res.status(401).json({ error: "invalid credentials" });
    }

    const token = signToken(student);
    res.json({ token, student: sanitizeStudent(student) });
  } catch (error) {
    res.status(500).json({ error: "Failed to login" });
  }
});

module.exports = router;
