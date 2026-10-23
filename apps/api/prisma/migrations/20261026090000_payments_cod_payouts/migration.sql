-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "attempt" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "checkout" JSONB,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "refundRef" TEXT,
ADD COLUMN     "refundedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "refundedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Payout" ADD COLUMN     "accountMask" TEXT;

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" UUID NOT NULL,
    "gateway" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "gatewayRef" TEXT NOT NULL,
    "paymentId" UUID,
    "status" TEXT NOT NULL,
    "amount" DECIMAL(12,2),
    "payload" JSONB,
    "note" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentEvent_processedAt_createdAt_idx" ON "PaymentEvent"("processedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_gateway_eventId_key" ON "PaymentEvent"("gateway", "eventId");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- The ledger is append-only: a mistake is corrected with a new ADJUSTMENT entry, never by editing history.
CREATE TRIGGER ledger_no_update BEFORE UPDATE OR DELETE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- An order's earning, its commission and its refund are each posted once, however many times the job runs.
CREATE UNIQUE INDEX "LedgerEntry_order_once_per_type" ON "LedgerEntry" ("orderId", "type")
  WHERE "orderId" IS NOT NULL AND "type" IN ('ORDER_EARNING', 'COMMISSION', 'REFUND');

-- Money sanity checks.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_refund_within_amount" CHECK ("refundedAmount" >= 0 AND "refundedAmount" <= "amount");
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "CodCollection" ADD CONSTRAINT "CodCollection_amount_positive" CHECK ("amount" > 0);
