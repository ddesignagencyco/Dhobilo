-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('ORDERS', 'PAYMENTS', 'PAYOUTS', 'COD', 'VENDORS');

-- CreateEnum
CREATE TYPE "ReportFormat" AS ENUM ('CSV', 'XLSX');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('QUEUED', 'RUNNING', 'READY', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "bodyUr" TEXT,
ADD COLUMN     "channels" "NotificationChannel"[],
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "error" TEXT,
ADD COLUMN     "recipientCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" "AnnouncementStatus" NOT NULL DEFAULT 'QUEUED',
ADD COLUMN     "titleUr" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "announcementId" UUID;

-- CreateTable
CREATE TABLE "DailyCityStat" (
    "day" DATE NOT NULL,
    "cityId" INTEGER NOT NULL,
    "ordersPlaced" INTEGER NOT NULL DEFAULT 0,
    "ordersDelivered" INTEGER NOT NULL DEFAULT 0,
    "ordersCancelled" INTEGER NOT NULL DEFAULT 0,
    "gmv" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "commission" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vendorEarnings" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deliveryFees" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discounts" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "codGmv" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "activeCustomers" INTEGER NOT NULL DEFAULT 0,
    "newCustomers" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyCityStat_pkey" PRIMARY KEY ("day","cityId")
);

-- CreateTable
CREATE TABLE "DailyVendorStat" (
    "day" DATE NOT NULL,
    "vendorId" UUID NOT NULL,
    "cityId" INTEGER NOT NULL,
    "ordersPlaced" INTEGER NOT NULL DEFAULT 0,
    "ordersDelivered" INTEGER NOT NULL DEFAULT 0,
    "ordersCancelled" INTEGER NOT NULL DEFAULT 0,
    "gmv" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "commission" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vendorEarnings" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyVendorStat_pkey" PRIMARY KEY ("day","vendorId")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" UUID NOT NULL,
    "type" "ReportType" NOT NULL,
    "format" "ReportFormat" NOT NULL,
    "params" JSONB NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'QUEUED',
    "requestedById" UUID NOT NULL,
    "rowCount" INTEGER,
    "byteSize" INTEGER,
    "fileName" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportFile" (
    "reportId" UUID NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "ReportFile_pkey" PRIMARY KEY ("reportId")
);

-- CreateIndex
CREATE INDEX "DailyVendorStat_vendorId_day_idx" ON "DailyVendorStat"("vendorId", "day");

-- CreateIndex
CREATE INDEX "Report_requestedById_createdAt_idx" ON "Report"("requestedById", "createdAt");

-- CreateIndex
CREATE INDEX "Report_status_expiresAt_idx" ON "Report"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Announcement_createdAt_idx" ON "Announcement"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_announcementId_status_idx" ON "Notification"("announcementId", "status");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportFile" ADD CONSTRAINT "ReportFile_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Analytics reads orders by the day they were delivered, and the audit viewer filters by time and action.
-- CreateIndex
CREATE INDEX "Order_deliveredAt_idx" ON "Order"("deliveredAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
