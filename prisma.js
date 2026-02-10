const { PrismaClient } = require("@prisma/client");

// Instantiate PrismaClient - heavily used across the app for database access
const prisma = new PrismaClient();

module.exports = prisma;
