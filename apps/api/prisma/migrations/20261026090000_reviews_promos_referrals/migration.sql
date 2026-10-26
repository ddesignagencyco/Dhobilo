-- Rider rating aggregates (customer reviews).
ALTER TABLE "Rider" ADD COLUMN     "ratingAvg" DECIMAL(3,2) NOT NULL DEFAULT 0,
ADD COLUMN     "ratingCount" INTEGER NOT NULL DEFAULT 0;

-- A referral reward is a personal promo code owned by the referrer.
ALTER TABLE "PromoCode" ADD COLUMN     "ownerUserId" UUID;
ALTER TABLE "Referral" ADD COLUMN     "rewardPromoId" UUID;

-- Redo handling keeps the completed leg and adds another attempt.
ALTER TABLE "DeliveryJob" ADD COLUMN     "attempt" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "isRedo" BOOLEAN NOT NULL DEFAULT false;

DROP INDEX "DeliveryJob_orderId_jobType_key";
CREATE UNIQUE INDEX "DeliveryJob_orderId_jobType_attempt_key" ON "DeliveryJob"("orderId", "jobType", "attempt");

CREATE UNIQUE INDEX "Referral_rewardPromoId_key" ON "Referral"("rewardPromoId");
CREATE INDEX "PromoCode_ownerUserId_idx" ON "PromoCode"("ownerUserId");

ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_rewardPromoId_fkey" FOREIGN KEY ("rewardPromoId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
