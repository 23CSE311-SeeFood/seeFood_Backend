-- AlterTable
ALTER TABLE "RoomMember" ADD COLUMN     "orderId" INTEGER;

-- CreateIndex
CREATE INDEX "RoomMember_orderId_idx" ON "RoomMember"("orderId");

-- AddForeignKey
ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
