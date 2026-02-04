-- CreateTable
CREATE TABLE "Canteen" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "ratings" DOUBLE PRECISION,

    CONSTRAINT "Canteen_pkey" PRIMARY KEY ("id")
);
