-- CreateTable
CREATE TABLE "CanteenItem" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "rating" DOUBLE PRECISION,
    "isVeg" BOOLEAN NOT NULL,
    "canteenId" INTEGER NOT NULL,

    CONSTRAINT "CanteenItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CanteenItem_canteenId_idx" ON "CanteenItem"("canteenId");

-- AddForeignKey
ALTER TABLE "CanteenItem" ADD CONSTRAINT "CanteenItem_canteenId_fkey" FOREIGN KEY ("canteenId") REFERENCES "Canteen"("id") ON DELETE CASCADE ON UPDATE CASCADE;
