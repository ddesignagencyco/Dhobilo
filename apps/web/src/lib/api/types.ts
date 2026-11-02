import type {
  Availability,
  ComplaintStatus,
  DiscountType,
  JobStatus,
  JobType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PayoutMethod,
  PayoutStatus,
  RiderStatus,
  VendorStatus,
} from '@dhoblio/shared';

/**
 * Response shapes for the admin endpoints.
 *
 * These are written by hand rather than taken from src/lib/api/schema.d.ts. The generated file is real and
 * useful for request paths, but the API's Swagger decorators describe most admin responses as
 * `{ type: 'object' }` with a documented *example* and no property schema, so the generated types give
 * `unknown` where it matters. Every type here was read off the example in apps/api/openapi.json for that
 * route, with the field's Prisma type as the tiebreaker.
 *
 * Money is always a decimal string in rupees ("170.00") — see @dhoblio/shared/money.
 *
 * Worth fixing upstream (tracker X-2): adding @ApiQuery/@ApiResponse schemas to the admin controllers
 * would let this file be generated instead of maintained.
 */

export interface Paged<T> {
  data: T[];
  meta?: { nextCursor?: string | null };
}

export interface City {
  id: number;
  name: string;
  nameUr?: string | null;
  code: string;
  isActive: boolean;
  deliveryFee?: string;
  timezone?: string;
  courierPartnerId?: string | null;
}

export interface AdminVendorListItem {
  id: string;
  businessName: string;
  status: VendorStatus;
  cityId: number;
  createdAt: string;
  owner: { phone: string | null; email: string | null };
  _count?: { documents: number };
}

export interface VendorDocument {
  id: string;
  type: string;
  verifiedAt: string | null;
  /** Short-lived Cloudinary link; vendor documents are private assets with no public URL. */
  signedUrl: string | null;
}

export interface AdminVendorDetail {
  id: string;
  ownerId: string;
  businessName: string;
  description: string | null;
  status: VendorStatus;
  rejectionReason: string | null;
  cityId: number;
  addressLine: string | null;
  lat: number | null;
  lng: number | null;
  availability: Availability;
  serviceRadiusKm: string;
  respondWithinMin: number;
  slotCapacity: number;
  ratingAvg: string;
  ratingCount: number;
  approvedAt: string | null;
  approvedById: string | null;
  createdAt: string;
  updatedAt: string;
  owner: { id: string; phone: string | null; email: string | null; name: string | null };
  /** Masked by default. The full value needs GET /admin/vendors/:id/cnic, which is audited. */
  cnicMasked: string | null;
  documents: VendorDocument[];
}

export interface AdminRiderListItem {
  id: string;
  status: RiderStatus;
  cityId: number;
  isOnline?: boolean;
  createdAt: string;
  user?: { id?: string; name: string | null; phone: string | null };
}

export interface AdminRiderDetail extends AdminRiderListItem {
  cnicMasked: string | null;
  rejectionReason: string | null;
  approvedAt: string | null;
  photoUrl?: string | null;
  vehicleType?: string | null;
  ratingAvg?: string;
  ratingCount?: number;
}

/** Note the API's names: `orderNo`, not orderNumber, and `placedAt`, not createdAt. */
export interface AdminOrderListItem {
  id: string;
  orderNo: string;
  status: OrderStatus;
  total: string;
  paymentMethod: PaymentMethod;
  paymentStatus?: PaymentStatus;
  placedAt: string;
  vendor?: { id: string; businessName: string };
  customer?: { id: string; name: string | null; phone: string | null };
}

export interface OrderItem {
  id: string;
  serviceItemId: string;
  name: string;
  nameUr?: string | null;
  serviceType: string;
  unitPrice: string;
  qty: number;
  lineTotal?: string;
}

export interface AddressSnapshot {
  label: string | null;
  line1: string | null;
  line2: string | null;
  area: string | null;
  cityId: number;
  lat: number | null;
  lng: number | null;
}

export interface AdminOrderDetail {
  id: string;
  orderNo: string;
  status: OrderStatus;
  currency: string;
  vendor: { id: string; businessName: string };
  customer: { id: string; name: string | null; phone: string | null };
  addressSnapshot: AddressSnapshot | null;
  pickupSlotStart: string | null;
  pickupSlotEnd: string | null;
  deliverySlotStart: string | null;
  deliverySlotEnd: string | null;
  subtotal: string;
  discountTotal: string;
  deliveryFee: string;
  total: string;
  /** Commission is internal: it is fixed on the order at placement and never shown to customers. */
  commissionRatePct: string;
  commissionAmount: string;
  vendorEarning: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  customerNote: string | null;
  vendorRespondBy: string | null;
  rejectionReason: string | null;
  cancelReason: string | null;
  placedAt: string;
  acceptedAt: string | null;
  pickedUpAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
  items: OrderItem[];
}

export interface OrderTimelineEntry {
  status: OrderStatus;
  from: OrderStatus | null;
  at: string;
  /** Who caused the transition: CUSTOMER, VENDOR, RIDER, ADMIN or SYSTEM. */
  by: string | null;
  note: string | null;
}

/** GET /orders/:id/delivery — the pickup and drop legs. Field names differ from the admin job board. */
export interface OrderDeliveryLeg {
  id: string;
  jobType: JobType;
  status: JobStatus;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  startedAt: string | null;
  completedAt: string | null;
  handledBy: string | null;
  rider: { name: string | null; photoUrl: string | null } | null;
}

export interface DeliveryJob {
  id: string;
  type: JobType;
  status: JobStatus;
  orderId: string;
  orderNumber?: string;
  riderId: string | null;
  rider?: { id: string; name: string | null; phone: string | null } | null;
  windowStart?: string | null;
  windowEnd?: string | null;
  attempts?: number;
  createdAt: string;
}

export interface DeliverySummary {
  jobs: Partial<Record<JobStatus, number>>;
  needAttention: number;
  onlineRiders: number;
}

export interface CourierPartner {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface AdminPayout {
  id: string;
  vendorId: string;
  vendor?: { id: string; businessName: string };
  amount: string;
  method: PayoutMethod;
  /** Only the last 4 digits of the account are returned. */
  accountRef: string;
  status: PayoutStatus;
  note: string | null;
  txnRef: string | null;
  rejectionReason?: string | null;
  requestedAt: string;
  decidedAt?: string | null;
  paidAt?: string | null;
}

export interface CodBalance {
  riderId: string;
  rider?: { id: string; name: string | null; phone: string | null };
  /** Cash the rider is holding and has not deposited. */
  outstanding: string;
  orders: number;
}

export interface CodCollection {
  id: string;
  riderId: string;
  orderId: string;
  orderNumber?: string;
  amount: string;
  settled: boolean;
  settledAt: string | null;
  reference?: string | null;
  collectedAt: string;
}

export interface CommissionRule {
  id: string;
  scope: 'GLOBAL' | 'CATEGORY' | 'VENDOR';
  vendorId: string | null;
  vendor?: { id: string; businessName: string } | null;
  categoryId: number | null;
  category?: { id: number; name: string } | null;
  /** A percentage, already scaled: "15" means 15%. */
  ratePct: string;
  effectiveFrom: string;
  createdAt: string;
}

export interface ServiceCategory {
  id: number;
  name: string;
  nameUr?: string | null;
  serviceType?: string;
}

export interface AdminComplaint {
  id: string;
  orderId: string;
  orderNumber?: string;
  type: 'COMPLAINT' | 'REDO';
  status: ComplaintStatus;
  subject?: string | null;
  assignedToId: string | null;
  outcome?: string | null;
  createdAt: string;
  customer?: { id: string; name: string | null; phone: string | null };
  vendor?: { id: string; businessName: string };
}

export interface ComplaintMessage {
  id: string;
  body: string;
  authorRole: string;
  authorName?: string | null;
  createdAt: string;
  attachments?: { id: string; signedUrl: string | null }[];
}

export interface AdminPromo {
  id: string;
  code: string;
  discountType: DiscountType;
  value: string;
  maxDiscount: string | null;
  minOrderAmount: string | null;
  maxUses: number | null;
  usedCount: number;
  perUserLimit: number;
  validFrom: string;
  validTo: string;
  cityId: number | null;
  isActive: boolean;
  createdAt: string;
}

export interface AnnouncementPreview {
  recipients: number;
  perChannel?: Partial<Record<string, number>>;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  titleUr: string | null;
  bodyUr: string | null;
  status: 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED';
  channels: string[];
  recipients: number;
  sentCount?: number;
  createdAt: string;
  createdById?: string;
}

export interface ReportJob {
  id: string;
  type: 'ORDERS' | 'PAYMENTS' | 'PAYOUTS' | 'COD' | 'VENDORS';
  format: 'CSV' | 'XLSX';
  status: 'QUEUED' | 'RUNNING' | 'READY' | 'FAILED' | 'EXPIRED';
  from: string | null;
  to: string | null;
  cityId: number | null;
  rows: number | null;
  error: string | null;
  /** Present only while READY; HMAC-signed and valid for 10 minutes. */
  downloadUrl: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  actorId: string | null;
  actorRole: string | null;
  actor?: { id: string; name: string | null; email: string | null } | null;
  ip: string | null;
  requestId: string | null;
  meta?: unknown;
  createdAt: string;
}

export interface AdminUser {
  id: string;
  name: string | null;
  email: string | null;
  adminRole: 'SUPER_ADMIN' | 'OPERATIONS' | 'FINANCE' | 'SUPPORT';
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  lastLoginAt?: string | null;
  createdAt: string;
}

export interface AnalyticsTotals {
  ordersPlaced: number;
  ordersDelivered: number;
  ordersCancelled: number;
  gmv: string;
  revenue: string;
  vendorEarnings: string;
  deliveryFees: string;
  discounts: string;
  averageOrderValue: string;
  activeCustomers: number;
  newCustomers: number;
  approvedVendors: number;
}

export interface AnalyticsDay {
  day: string;
  ordersPlaced: number;
  ordersDelivered: number;
  ordersCancelled: number;
  gmv: string;
  revenue: string;
  vendorEarnings: string;
  deliveryFees: string;
  discounts: string;
  averageOrderValue: string;
}

export interface AnalyticsOverview {
  range: { from: string; to: string; cityId: number | null };
  totals: AnalyticsTotals;
  series: AnalyticsDay[];
}

export interface TopVendor {
  vendorId: string;
  businessName: string;
  cityId?: number;
  orders: number;
  gmv: string;
  revenue?: string;
  ratingAvg?: string;
}

export interface QueueHealth {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  stuck?: number;
  latestFailures?: { id: string; name: string; failedReason: string; attemptsMade: number }[];
}
