-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('OPEN', 'ORDERED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RoomMemberStatus" AS ENUM ('PENDING', 'PAID', 'REFUNDED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "roomId" INTEGER;

-- CreateTable
CREATE TABLE "Room" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "canteenId" INTEGER NOT NULL,
    "status" "RoomStatus" NOT NULL DEFAULT 'OPEN',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomMember" (
    "id" SERIAL NOT NULL,
    "roomId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "status" "RoomMemberStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DOUBLE PRECISION,
    "razorpayOrderId" TEXT,
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomMemberItem" (
    "id" SERIAL NOT NULL,
    "roomMemberId" INTEGER NOT NULL,
    "canteenItemId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "RoomMemberItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Room_code_key" ON "Room"("code");

-- CreateIndex
CREATE INDEX "Room_ownerId_idx" ON "Room"("ownerId");

-- CreateIndex
CREATE INDEX "Room_canteenId_idx" ON "Room"("canteenId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomMember_razorpayOrderId_key" ON "RoomMember"("razorpayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomMember_paymentId_key" ON "RoomMember"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomMember_roomId_studentId_key" ON "RoomMember"("roomId", "studentId");

-- CreateIndex
CREATE INDEX "RoomMember_roomId_idx" ON "RoomMember"("roomId");

-- CreateIndex
CREATE INDEX "RoomMember_studentId_idx" ON "RoomMember"("studentId");

-- CreateIndex
CREATE INDEX "RoomMemberItem_roomMemberId_idx" ON "RoomMemberItem"("roomMemberId");

-- CreateIndex
CREATE INDEX "RoomMemberItem_canteenItemId_idx" ON "RoomMemberItem"("canteenItemId");

-- CreateIndex
CREATE INDEX "Order_roomId_idx" ON "Order"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_roomId_key" ON "Order"("roomId");

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_canteenId_fkey" FOREIGN KEY ("canteenId") REFERENCES "Canteen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMemberItem" ADD CONSTRAINT "RoomMemberItem_roomMemberId_fkey" FOREIGN KEY ("roomMemberId") REFERENCES "RoomMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMemberItem" ADD CONSTRAINT "RoomMemberItem_canteenItemId_fkey" FOREIGN KEY ("canteenItemId") REFERENCES "CanteenItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
