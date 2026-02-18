/*
  Warnings:

  - You are about to drop the column `isVeg` on the `CanteenItem` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "FoodType" AS ENUM ('VEG', 'NON_VEG');

-- CreateEnum
CREATE TYPE "ItemCategory" AS ENUM ('RICE', 'CURRIES', 'ICECREAM', 'ROOTI', 'DRINKS', 'OTHER');

-- AlterTable
ALTER TABLE "CanteenItem" DROP COLUMN "isVeg",
ADD COLUMN     "category" "ItemCategory" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "foodType" "FoodType" NOT NULL DEFAULT 'VEG';
