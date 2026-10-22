-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CUSTOMER', 'VENDOR_OWNER', 'VENDOR_STAFF', 'RIDER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('EN', 'UR');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('LOGIN', 'DELIVERY_PROOF');

-- CreateEnum
CREATE TYPE "VendorStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "Availability" AS ENUM ('OPEN', 'CLOSED', 'BUSY');

-- CreateEnum
CREATE TYPE "RiderStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('CNIC_FRONT', 'CNIC_BACK', 'SHOP_PHOTO', 'BUSINESS_REG', 'RIDER_PHOTO');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('WASH_FOLD', 'WASH_IRON', 'DRY_CLEAN', 'IRON_ONLY', 'OTHER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PLACED', 'ACCEPTED', 'REJECTED', 'PICKED_UP', 'IN_PROCESS', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('COD', 'CARD', 'JAZZCASH', 'EASYPAISA', 'RAAST');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'COD_PENDING', 'COD_COLLECTED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('PICKUP', 'DROP');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('UNASSIGNED', 'ASSIGNED', 'ACCEPTED', 'IN_TRANSIT', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProofType" AS ENUM ('PHOTO', 'OTP');

-- CreateEnum
CREATE TYPE "ReviewTarget" AS ENUM ('VENDOR', 'RIDER');

-- CreateEnum
CREATE TYPE "ComplaintType" AS ENUM ('COMPLAINT', 'REDO');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'VENDOR_RESPONDED', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FLAT');

-- CreateEnum
CREATE TYPE "CommissionScope" AS ENUM ('GLOBAL', 'CATEGORY', 'VENDOR');

-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('BANK', 'WALLET');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PAID', 'REJECTED');

-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('ORDER_EARNING', 'COMMISSION', 'PAYOUT', 'ADJUSTMENT', 'REFUND');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('SMS', 'WHATSAPP', 'PUSH', 'EMAIL');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'REWARDED');

-- CreateTable
CREATE TABLE "City" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "nameUr" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Karachi',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "name" TEXT,
    "role" "Role" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "locale" "Locale" NOT NULL DEFAULT 'EN',
    "referralCode" TEXT,
    "phoneVerifiedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "refreshHash" TEXT NOT NULL,
    "deviceInfo" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "label" TEXT,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "area" TEXT,
    "cityId" INTEGER NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "cityId" INTEGER NOT NULL,
    "businessName" TEXT NOT NULL,
    "description" TEXT,
    "addressLine" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "cnicEnc" TEXT NOT NULL,
    "cnicHash" TEXT NOT NULL,
    "status" "VendorStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" UUID,
    "availability" "Availability" NOT NULL DEFAULT 'CLOSED',
    "serviceRadiusKm" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "respondWithinMin" INTEGER NOT NULL DEFAULT 15,
    "ratingAvg" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorStaff" (
    "id" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "VendorStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorDocument" (
    "id" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "type" "DocType" NOT NULL,
    "publicId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorHours" (
    "id" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "opensAt" INTEGER NOT NULL,
    "closesAt" INTEGER NOT NULL,

    CONSTRAINT "VendorHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "nameUr" TEXT,

    CONSTRAINT "ServiceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceItem" (
    "id" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "itemName" TEXT NOT NULL,
    "itemNameUr" TEXT,
    "serviceType" "ServiceType" NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "turnaroundHours" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cart" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" UUID NOT NULL,
    "cartId" UUID NOT NULL,
    "serviceItemId" UUID NOT NULL,
    "qty" INTEGER NOT NULL,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "orderNo" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "customerId" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "cityId" INTEGER NOT NULL,
    "addressId" UUID,
    "addressSnapshot" JSONB NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PLACED',
    "pickupSlotStart" TIMESTAMP(3) NOT NULL,
    "pickupSlotEnd" TIMESTAMP(3) NOT NULL,
    "deliverySlotStart" TIMESTAMP(3) NOT NULL,
    "deliverySlotEnd" TIMESTAMP(3) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discountTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deliveryFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "commissionRatePct" DECIMAL(5,2) NOT NULL,
    "commissionAmount" DECIMAL(12,2) NOT NULL,
    "vendorEarning" DECIMAL(12,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "promoId" UUID,
    "customerNote" TEXT,
    "vendorRespondBy" TIMESTAMP(3) NOT NULL,
    "rejectionReason" TEXT,
    "cancelReason" TEXT,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "serviceItemId" UUID,
    "name" TEXT NOT NULL,
    "nameUr" TEXT,
    "serviceType" "ServiceType" NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "qty" INTEGER NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusHistory" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "actorId" UUID,
    "actorRole" "Role",
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rider" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "cityId" INTEGER NOT NULL,
    "status" "RiderStatus" NOT NULL DEFAULT 'PENDING',
    "cnicEnc" TEXT NOT NULL,
    "cnicHash" TEXT NOT NULL,
    "photoUrl" TEXT,
    "photoPublicId" TEXT,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "lastLat" DOUBLE PRECISION,
    "lastLng" DOUBLE PRECISION,
    "lastSeenAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourierPartner" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "configJson" JSONB,

    CONSTRAINT "CourierPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryJob" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "jobType" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'UNASSIGNED',
    "riderId" UUID,
    "partnerId" UUID,
    "partnerRef" TEXT,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "assignedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "proofType" "ProofType",
    "proofPhotoUrl" TEXT,
    "proofPhotoPublicId" TEXT,
    "proofOtpHash" TEXT,
    "failureReason" TEXT,
    "riderFee" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "gateway" TEXT NOT NULL,
    "gatewayRef" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodSettlement" (
    "id" UUID NOT NULL,
    "riderId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reference" TEXT,
    "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledBy" UUID,

    CONSTRAINT "CodSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodCollection" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "riderId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settlementId" UUID,

    CONSTRAINT "CodCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" UUID NOT NULL,
    "scope" "CommissionScope" NOT NULL,
    "vendorId" UUID,
    "categoryId" INTEGER,
    "ratePct" DECIMAL(5,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID,

    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PayoutMethod" NOT NULL,
    "accountRef" TEXT NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processedBy" UUID,
    "txnRef" TEXT,
    "note" TEXT,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "orderId" UUID,
    "payoutId" UUID,
    "type" "LedgerType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "targetType" "ReviewTarget" NOT NULL,
    "vendorId" UUID,
    "riderId" UUID,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Complaint" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "type" "ComplaintType" NOT NULL,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'OPEN',
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "attachments" JSONB,
    "resolution" TEXT,
    "assignedToId" UUID,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintMessage" (
    "id" UUID NOT NULL,
    "complaintId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "authorRole" "Role" NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplaintMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "discountType" "DiscountType" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "maxDiscount" DECIMAL(10,2),
    "minOrderAmount" DECIMAL(10,2),
    "maxUses" INTEGER,
    "perUserLimit" INTEGER NOT NULL DEFAULT 1,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "cityId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoRedemption" (
    "id" UUID NOT NULL,
    "promoId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" UUID NOT NULL,
    "referrerId" UUID NOT NULL,
    "refereeId" UUID NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "rewardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "template" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "segment" JSONB NOT NULL,
    "sentById" UUID NOT NULL,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "actorRole" "Role",
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "City_name_key" ON "City"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE INDEX "OtpCode_phone_purpose_createdAt_idx" ON "OtpCode"("phone", "purpose", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshHash_key" ON "Session"("refreshHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");

-- CreateIndex
CREATE INDEX "DeviceToken_userId_idx" ON "DeviceToken"("userId");

-- CreateIndex
CREATE INDEX "Address_userId_deletedAt_idx" ON "Address"("userId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_ownerId_key" ON "Vendor"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_cnicHash_key" ON "Vendor"("cnicHash");

-- CreateIndex
CREATE INDEX "Vendor_cityId_status_availability_idx" ON "Vendor"("cityId", "status", "availability");

-- CreateIndex
CREATE INDEX "Vendor_lat_lng_idx" ON "Vendor"("lat", "lng");

-- CreateIndex
CREATE UNIQUE INDEX "VendorStaff_vendorId_userId_key" ON "VendorStaff"("vendorId", "userId");

-- CreateIndex
CREATE INDEX "VendorDocument_vendorId_type_idx" ON "VendorDocument"("vendorId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "VendorHours_vendorId_dayOfWeek_key" ON "VendorHours"("vendorId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCategory_name_key" ON "ServiceCategory"("name");

-- CreateIndex
CREATE INDEX "ServiceItem_vendorId_isActive_idx" ON "ServiceItem"("vendorId", "isActive");

-- CreateIndex
CREATE INDEX "ServiceItem_categoryId_idx" ON "ServiceItem"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceItem_vendorId_itemName_serviceType_key" ON "ServiceItem"("vendorId", "itemName", "serviceType");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_customerId_vendorId_key" ON "Cart"("customerId", "vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_serviceItemId_key" ON "CartItem"("cartId", "serviceItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNo_key" ON "Order"("orderNo");

-- CreateIndex
CREATE INDEX "Order_customerId_createdAt_idx" ON "Order"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_vendorId_status_idx" ON "Order"("vendorId", "status");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_cityId_createdAt_idx" ON "Order"("cityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_customerId_idempotencyKey_key" ON "Order"("customerId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_orderId_createdAt_idx" ON "OrderStatusHistory"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Rider_userId_key" ON "Rider"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Rider_cnicHash_key" ON "Rider"("cnicHash");

-- CreateIndex
CREATE INDEX "Rider_cityId_status_isOnline_idx" ON "Rider"("cityId", "status", "isOnline");

-- CreateIndex
CREATE UNIQUE INDEX "CourierPartner_code_key" ON "CourierPartner"("code");

-- CreateIndex
CREATE INDEX "DeliveryJob_riderId_status_idx" ON "DeliveryJob"("riderId", "status");

-- CreateIndex
CREATE INDEX "DeliveryJob_status_jobType_idx" ON "DeliveryJob"("status", "jobType");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryJob_orderId_jobType_key" ON "DeliveryJob"("orderId", "jobType");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_gateway_gatewayRef_key" ON "Payment"("gateway", "gatewayRef");

-- CreateIndex
CREATE INDEX "CodSettlement_riderId_settledAt_idx" ON "CodSettlement"("riderId", "settledAt");

-- CreateIndex
CREATE UNIQUE INDEX "CodCollection_orderId_key" ON "CodCollection"("orderId");

-- CreateIndex
CREATE INDEX "CodCollection_riderId_settlementId_idx" ON "CodCollection"("riderId", "settlementId");

-- CreateIndex
CREATE INDEX "CommissionRule_scope_vendorId_categoryId_effectiveFrom_idx" ON "CommissionRule"("scope", "vendorId", "categoryId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "Payout_vendorId_status_idx" ON "Payout"("vendorId", "status");

-- CreateIndex
CREATE INDEX "LedgerEntry_vendorId_createdAt_idx" ON "LedgerEntry"("vendorId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_orderId_idx" ON "LedgerEntry"("orderId");

-- CreateIndex
CREATE INDEX "Review_vendorId_createdAt_idx" ON "Review"("vendorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Review_orderId_targetType_key" ON "Review"("orderId", "targetType");

-- CreateIndex
CREATE INDEX "Complaint_vendorId_status_idx" ON "Complaint"("vendorId", "status");

-- CreateIndex
CREATE INDEX "Complaint_status_createdAt_idx" ON "Complaint"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ComplaintMessage_complaintId_createdAt_idx" ON "ComplaintMessage"("complaintId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

-- CreateIndex
CREATE INDEX "PromoRedemption_promoId_userId_idx" ON "PromoRedemption"("promoId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoRedemption_promoId_orderId_key" ON "PromoRedemption"("promoId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_refereeId_key" ON "Referral"("refereeId");

-- CreateIndex
CREATE INDEX "Referral_referrerId_idx" ON "Referral"("referrerId");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_status_channel_idx" ON "Notification"("status", "channel");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorStaff" ADD CONSTRAINT "VendorStaff_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorStaff" ADD CONSTRAINT "VendorStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDocument" ADD CONSTRAINT "VendorDocument_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorHours" ADD CONSTRAINT "VendorHours_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceItem" ADD CONSTRAINT "ServiceItem_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceItem" ADD CONSTRAINT "ServiceItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_promoId_fkey" FOREIGN KEY ("promoId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rider" ADD CONSTRAINT "Rider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rider" ADD CONSTRAINT "Rider_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryJob" ADD CONSTRAINT "DeliveryJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryJob" ADD CONSTRAINT "DeliveryJob_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryJob" ADD CONSTRAINT "DeliveryJob_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "CourierPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodSettlement" ADD CONSTRAINT "CodSettlement_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodCollection" ADD CONSTRAINT "CodCollection_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodCollection" ADD CONSTRAINT "CodCollection_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodCollection" ADD CONSTRAINT "CodCollection_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "CodSettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintMessage" ADD CONSTRAINT "ComplaintMessage_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintMessage" ADD CONSTRAINT "ComplaintMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_promoId_fkey" FOREIGN KEY ("promoId") REFERENCES "PromoCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ───────────── Constraints Prisma cannot express (ERD §6.1) ─────────────
ALTER TABLE "Review"      ADD CONSTRAINT review_rating_chk CHECK (rating BETWEEN 1 AND 5);
ALTER TABLE "OrderItem"   ADD CONSTRAINT orderitem_qty_chk CHECK (qty > 0);
ALTER TABLE "CartItem"    ADD CONSTRAINT cartitem_qty_chk  CHECK (qty > 0);
ALTER TABLE "Vendor"      ADD CONSTRAINT vendor_radius_chk CHECK ("serviceRadiusKm" > 0);
ALTER TABLE "VendorHours" ADD CONSTRAINT hours_chk CHECK ("opensAt" < "closesAt" AND "dayOfWeek" BETWEEN 0 AND 6);

-- Append-only guard for audit/history tables (SRS §7 Auditability)
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'append-only table'; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER audit_no_update BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER status_hist_no_update BEFORE UPDATE OR DELETE ON "OrderStatusHistory"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
