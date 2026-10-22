-- AlterTable
ALTER TABLE "City" ADD COLUMN     "code" TEXT,
ADD COLUMN     "deliveryFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "orderSeq" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "slotCapacity" INTEGER NOT NULL DEFAULT 10;

-- CreateIndex
CREATE UNIQUE INDEX "City_code_key" ON "City"("code");


-- Sanity checks Prisma cannot express
ALTER TABLE "Vendor" ADD CONSTRAINT vendor_slot_capacity_chk CHECK ("slotCapacity" > 0);
ALTER TABLE "City"   ADD CONSTRAINT city_delivery_fee_chk CHECK ("deliveryFee" >= 0);
