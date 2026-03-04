-- CreateEnum
CREATE TYPE "PrebookStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'EXPIRED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "isPrebooked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scheduledFor" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Prebook" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "canteenId" INTEGER NOT NULL,
    "slotStart" TIMESTAMP(3) NOT NULL,
    "slotEnd" TIMESTAMP(3) NOT NULL,
    "status" "PrebookStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "total" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "razorpayOrderId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prebook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrebookItem" (
    "id" SERIAL NOT NULL,
    "prebookId" INTEGER NOT NULL,
    "canteenItemId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PrebookItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Prebook_razorpayOrderId_key" ON "Prebook"("razorpayOrderId");

-- CreateIndex
CREATE INDEX "Prebook_studentId_idx" ON "Prebook"("studentId");

-- CreateIndex
CREATE INDEX "Prebook_canteenId_slotStart_idx" ON "Prebook"("canteenId", "slotStart");

-- CreateIndex
CREATE INDEX "PrebookItem_prebookId_idx" ON "PrebookItem"("prebookId");

-- CreateIndex
CREATE INDEX "PrebookItem_canteenItemId_idx" ON "PrebookItem"("canteenItemId");

-- CreateIndex
CREATE INDEX "Order_canteenId_scheduledFor_idx" ON "Order"("canteenId", "scheduledFor");

-- AddForeignKey
ALTER TABLE "Prebook" ADD CONSTRAINT "Prebook_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prebook" ADD CONSTRAINT "Prebook_canteenId_fkey" FOREIGN KEY ("canteenId") REFERENCES "Canteen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrebookItem" ADD CONSTRAINT "PrebookItem_prebookId_fkey" FOREIGN KEY ("prebookId") REFERENCES "Prebook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrebookItem" ADD CONSTRAINT "PrebookItem_canteenItemId_fkey" FOREIGN KEY ("canteenItemId") REFERENCES "CanteenItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
