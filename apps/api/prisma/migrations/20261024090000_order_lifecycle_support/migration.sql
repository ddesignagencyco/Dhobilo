-- AlterTable
ALTER TABLE "OrderStatusHistory" ADD COLUMN     "seq" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notificationPrefs" JSONB;

-- CreateIndex
CREATE INDEX "OrderStatusHistory_orderId_seq_idx" ON "OrderStatusHistory"("orderId", "seq");

