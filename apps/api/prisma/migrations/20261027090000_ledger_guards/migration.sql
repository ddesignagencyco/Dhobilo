-- The ledger is append-only: a mistake is corrected with a new ADJUSTMENT entry, never by editing history.
-- (forbid_mutation() is the same guard already used for the audit log and order status history.)
CREATE TRIGGER ledger_no_update BEFORE UPDATE OR DELETE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- An order's earning, its commission memo and its refund are each posted once, however many times a job runs.
CREATE UNIQUE INDEX "LedgerEntry_order_once_per_type" ON "LedgerEntry" ("orderId", "type")
  WHERE "orderId" IS NOT NULL AND "type" IN ('ORDER_EARNING', 'COMMISSION', 'REFUND');

-- Money sanity checks.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "CodCollection" ADD CONSTRAINT "CodCollection_amount_positive" CHECK ("amount" > 0);
