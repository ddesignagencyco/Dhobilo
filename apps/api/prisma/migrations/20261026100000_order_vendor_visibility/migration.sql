-- Online orders stay hidden from the vendor until they are paid (TRD §13.2); cash orders are visible at once.
ALTER TABLE "Order" ADD COLUMN "vendorVisibleAt" TIMESTAMP(3);

-- Every order that exists today was visible to its vendor when it was placed.
UPDATE "Order" SET "vendorVisibleAt" = "placedAt";

CREATE INDEX "Order_vendorId_vendorVisibleAt_idx" ON "Order" ("vendorId", "vendorVisibleAt");
