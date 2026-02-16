/*
  Warnings:

  - A unique constraint covering the columns `[studentId]` on the table `Cart` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Cart_studentId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Cart_studentId_key" ON "Cart"("studentId");
