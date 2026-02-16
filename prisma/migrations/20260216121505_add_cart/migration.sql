-- CreateTable
CREATE TABLE "Cart" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "canteenId" INTEGER NOT NULL,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" SERIAL NOT NULL,
    "cartId" INTEGER NOT NULL,
    "canteenItemId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Cart_studentId_idx" ON "Cart"("studentId");

-- CreateIndex
CREATE INDEX "Cart_canteenId_idx" ON "Cart"("canteenId");

-- CreateIndex
CREATE INDEX "CartItem_cartId_idx" ON "CartItem"("cartId");

-- CreateIndex
CREATE INDEX "CartItem_canteenItemId_idx" ON "CartItem"("canteenItemId");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_canteenItemId_key" ON "CartItem"("cartId", "canteenItemId");

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_canteenId_fkey" FOREIGN KEY ("canteenId") REFERENCES "Canteen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_canteenItemId_fkey" FOREIGN KEY ("canteenItemId") REFERENCES "CanteenItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
