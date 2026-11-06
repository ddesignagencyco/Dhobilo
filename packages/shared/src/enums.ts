/**
 * Enums mirrored from apps/api/prisma/schema.prisma.
 *
 * The web app cannot import @prisma/client (server-only, and it would drag the query engine into the
 * bundle), so these are plain const objects with the same members and the same string values.
 *
 * Drift guard: apps/api/src/common/shared-enums.spec.ts reads the Prisma schema and this file and fails
 * if a mirrored enum's members no longer match. Add a member here when you add one in the schema.
 */

export const Role = {
  CUSTOMER: 'CUSTOMER',
  VENDOR_OWNER: 'VENDOR_OWNER',
  VENDOR_STAFF: 'VENDOR_STAFF',
  RIDER: 'RIDER',
  ADMIN: 'ADMIN',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const AdminRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  OPERATIONS: 'OPERATIONS',
  FINANCE: 'FINANCE',
  SUPPORT: 'SUPPORT',
} as const;
export type AdminRole = (typeof AdminRole)[keyof typeof AdminRole];

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  DEACTIVATED: 'DEACTIVATED',
  PENDING_DELETION: 'PENDING_DELETION',
  DELETED: 'DELETED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const Locale = { EN: 'EN', UR: 'UR' } as const;
export type Locale = (typeof Locale)[keyof typeof Locale];

export const VendorStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
} as const;
export type VendorStatus = (typeof VendorStatus)[keyof typeof VendorStatus];

export const Availability = { OPEN: 'OPEN', CLOSED: 'CLOSED', BUSY: 'BUSY' } as const;
export type Availability = (typeof Availability)[keyof typeof Availability];

export const RiderStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
} as const;
export type RiderStatus = (typeof RiderStatus)[keyof typeof RiderStatus];

export const DocType = {
  CNIC_FRONT: 'CNIC_FRONT',
  CNIC_BACK: 'CNIC_BACK',
  SHOP_PHOTO: 'SHOP_PHOTO',
  BUSINESS_REG: 'BUSINESS_REG',
  RIDER_PHOTO: 'RIDER_PHOTO',
} as const;
export type DocType = (typeof DocType)[keyof typeof DocType];

export const ServiceType = {
  WASH_FOLD: 'WASH_FOLD',
  WASH_IRON: 'WASH_IRON',
  DRY_CLEAN: 'DRY_CLEAN',
  IRON_ONLY: 'IRON_ONLY',
  OTHER: 'OTHER',
} as const;
export type ServiceType = (typeof ServiceType)[keyof typeof ServiceType];

export const OrderStatus = {
  PLACED: 'PLACED',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  PICKED_UP: 'PICKED_UP',
  IN_PROCESS: 'IN_PROCESS',
  READY: 'READY',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

/** Terminal states: no further transition is possible, so action buttons stay hidden. */
export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
  OrderStatus.REJECTED,
];

export const PaymentMethod = {
  COD: 'COD',
  CARD: 'CARD',
  JAZZCASH: 'JAZZCASH',
  EASYPAISA: 'EASYPAISA',
  RAAST: 'RAAST',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
  COD_PENDING: 'COD_PENDING',
  COD_COLLECTED: 'COD_COLLECTED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const JobType = { PICKUP: 'PICKUP', DROP: 'DROP' } as const;
export type JobType = (typeof JobType)[keyof typeof JobType];

export const JobStatus = {
  UNASSIGNED: 'UNASSIGNED',
  ASSIGNED: 'ASSIGNED',
  ACCEPTED: 'ACCEPTED',
  IN_TRANSIT: 'IN_TRANSIT',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const ReviewTarget = { VENDOR: 'VENDOR', RIDER: 'RIDER' } as const;
export type ReviewTarget = (typeof ReviewTarget)[keyof typeof ReviewTarget];

export const ComplaintType = { COMPLAINT: 'COMPLAINT', REDO: 'REDO' } as const;
export type ComplaintType = (typeof ComplaintType)[keyof typeof ComplaintType];

export const ComplaintStatus = {
  OPEN: 'OPEN',
  IN_REVIEW: 'IN_REVIEW',
  VENDOR_RESPONDED: 'VENDOR_RESPONDED',
  RESOLVED: 'RESOLVED',
  REJECTED: 'REJECTED',
} as const;
export type ComplaintStatus = (typeof ComplaintStatus)[keyof typeof ComplaintStatus];

export const DiscountType = { PERCENT: 'PERCENT', FLAT: 'FLAT' } as const;
export type DiscountType = (typeof DiscountType)[keyof typeof DiscountType];

export const CommissionScope = { GLOBAL: 'GLOBAL', CATEGORY: 'CATEGORY', VENDOR: 'VENDOR' } as const;
export type CommissionScope = (typeof CommissionScope)[keyof typeof CommissionScope];

export const PayoutMethod = { BANK: 'BANK', WALLET: 'WALLET' } as const;
export type PayoutMethod = (typeof PayoutMethod)[keyof typeof PayoutMethod];

export const PayoutStatus = {
  REQUESTED: 'REQUESTED',
  APPROVED: 'APPROVED',
  PAID: 'PAID',
  REJECTED: 'REJECTED',
} as const;
export type PayoutStatus = (typeof PayoutStatus)[keyof typeof PayoutStatus];

export const LedgerType = {
  ORDER_EARNING: 'ORDER_EARNING',
  COMMISSION: 'COMMISSION',
  PAYOUT: 'PAYOUT',
  ADJUSTMENT: 'ADJUSTMENT',
  REFUND: 'REFUND',
} as const;
export type LedgerType = (typeof LedgerType)[keyof typeof LedgerType];

export const NotificationChannel = {
  SMS: 'SMS',
  WHATSAPP: 'WHATSAPP',
  PUSH: 'PUSH',
  EMAIL: 'EMAIL',
} as const;
export type NotificationChannel = (typeof NotificationChannel)[keyof typeof NotificationChannel];
