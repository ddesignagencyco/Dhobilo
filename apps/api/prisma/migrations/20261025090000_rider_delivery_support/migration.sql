-- AlterTable
ALTER TABLE "City" ADD COLUMN     "courierPartnerId" UUID;

-- AlterTable
ALTER TABLE "DeliveryJob" ADD COLUMN     "declinedRiderIds" UUID[] DEFAULT ARRAY[]::UUID[],
ADD COLUMN     "dispatchAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "proofOtpAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "proofOtpExpiresAt" TIMESTAMP(3),
ADD COLUMN     "unassignedAlertedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Rider" ADD COLUMN     "approvedById" UUID,
ADD COLUMN     "rejectionReason" TEXT;

-- CreateTable
CREATE TABLE "CourierWebhookEvent" (
    "id" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "eventId" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourierWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CourierWebhookEvent_partnerId_eventId_key" ON "CourierWebhookEvent"("partnerId", "eventId");

-- AddForeignKey
ALTER TABLE "City" ADD CONSTRAINT "City_courierPartnerId_fkey" FOREIGN KEY ("courierPartnerId") REFERENCES "CourierPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierWebhookEvent" ADD CONSTRAINT "CourierWebhookEvent_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "CourierPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- The built-in mock courier partner (inactive until an admin switches a city over to it).
INSERT INTO "CourierPartner" ("id", "code", "name", "isActive")
VALUES (gen_random_uuid(), 'mock', 'Mock courier (testing)', false)
ON CONFLICT ("code") DO NOTHING;
