/*
  Warnings:

  - You are about to drop the column `cashierId` on the `Order` table. All the data in the column will be lost.
  - Made the column `studentId` on table `Order` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_cashierId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_studentId_fkey";

-- DropIndex
DROP INDEX "Order_cashierId_idx";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "cashierId",
ALTER COLUMN "studentId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
