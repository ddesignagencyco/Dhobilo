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

/** GET /admin/delivery/jobs — the dispatch board. */
export interface DeliveryJobParty {
  role: string;
  name: string | null;
  /** Masked for the customer and vendor on this board. */
  phone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

export interface DeliveryJob {
  id: string;
  jobType: JobType;
  status: JobStatus;
  order: { id: string; orderNo: string; status: OrderStatus; cityId: number };
  rider: { id: string; name: string | null; phone: string | null } | null;
  partnerId: string | null;
  partnerRef: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  riderFee: string | null;
  from: DeliveryJobParty | null;
  to: DeliveryJobParty | null;
  attempts?: number;
  createdAt?: string;
}

export interface DeliverySummary {
  jobs: Partial<Record<JobStatus, number>>;
  /** Jobs the dispatcher should look at now: stuck, failed or out of attempts. */
  needAttention: number;
  onlineRiders: number;
}

export interface CourierPartner {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  cities?: { id: number; name: string }[];
}

export interface AdminPayout {
  id: string;
  amount: string;
  method: PayoutMethod;
  /** Only the last four digits reach the client. */
  accountRef: string;
  status: PayoutStatus;
  requestedAt: string;
  processedAt: string | null;
  processedBy: string | null;
  txnRef: string | null;
  note: string | null;
  vendor: { businessName: string } | null;
}

/** GET /admin/cod/balances — cash each rider is holding. Not paginated. */
export interface CodBalance {
  riderId: string;
  name: string | null;
  phone: string | null;
  orders: number;
  amount: string;
}

export interface CodCollection {
  id: string;
  orderId: string;
  orderNo: string;
  riderId: string;
  riderName: string | null;
  riderPhone: string | null;
  amount: string;
  collectedAt: string;
  /** null until an admin records the rider's deposit. */
  settlementId: string | null;
}

export interface CommissionRule {
  id: string;
  scope: 'GLOBAL' | 'CATEGORY' | 'VENDOR';
  vendorId: string | null;
  categoryId: number | null;
  /** A percentage already scaled: "15.00" means 15%. */
  ratePct: string;
  effectiveFrom: string;
  createdById: string | null;
  vendor: { businessName: string } | null;
  category: { name: string } | null;
}

export interface ServiceCategory {
  id: number;
  name: string;
  nameUr?: string | null;
}

/** Cloudinary attachments come with a short-lived signed link; the raw url is not publicly reachable. */
export interface ComplaintAttachment {
  publicId: string;
  url: string;
  format: string;
  signedUrl: string | null;
}

export interface AdminComplaint {
  id: string;
  orderId: string;
  customerId: string;
  vendorId: string;
  type: 'COMPLAINT' | 'REDO';
  status: ComplaintStatus;
  subject: string | null;
  description: string | null;
  attachments: ComplaintAttachment[];
  resolution: string | null;
  assignedToId: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt?: string;
  order?: { orderNo: string };
  vendor?: { businessName: string };
  customer?: { name: string | null; phone: string | null };
  assignedTo?: { id: string; name: string | null } | null;
  messages?: ComplaintMessage[];
}

export interface ComplaintMessage {
  id: string;
  authorId: string | null;
  authorRole: string;
  authorName: string | null;
  body: string;
  createdAt: string;
  attachments?: ComplaintAttachment[];
}

export interface AdminPromo {
  id: string;
  code: string;
  discountType: DiscountType;
  value: string;
  maxDiscount: string | null;
  minOrderAmount: string | null;
  maxUses: number | null;
  perUserLimit: number;
  validFrom: string;
  validTo: string;
  cityId: number | null;
  /** Set when the promo is a personal referral reward rather than a public campaign. */
  owner: { id: string; name: string | null } | null;
  isActive: boolean;
  redemptions: number;
  createdAt: string;
}

/** POST /admin/announcements/preview — how many people a segment reaches. */
export interface AnnouncementPreview {
  segment: Record<string, unknown>;
  /** People matching the segment. */
  recipients: number;
  /** Of those, how many can actually be reached on the chosen channels after opt-outs. */
  reachable: number;
  byRole?: Record<string, number>;
  byChannel?: Record<string, number>;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  titleUr: string | null;
  bodyUr: string | null;
  segment: Record<string, unknown>;
  channels: string[];
  status: 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED';
  recipientCount: number;
  messagesQueued: number;
  error: string | null;
  sentById: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ReportJob {
  id: string;
  type: 'ORDERS' | 'PAYMENTS' | 'PAYOUTS' | 'COD' | 'VENDORS';
  format: 'CSV' | 'XLSX';
  params: { from?: string; to?: string; cityId?: number | null; vendorId?: string | null };
  status: 'QUEUED' | 'RUNNING' | 'READY' | 'FAILED' | 'EXPIRED';
  rowCount: number | null;
  byteSize: number | null;
  fileName: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  /** When the file itself is deleted (7 days). */
  expiresAt: string | null;
  /** Present only while READY. HMAC-signed and good for ten minutes. */
  download: { url: string; expiresAt: string } | null;
}

export interface AuditLogEntry {
  id: string;
  createdAt: string;
  action: string;
  entity: string;
  entityId: string | null;
  actor: { id: string; name: string | null; role: string } | null;
  actorRole: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  requestId: string | null;
}

export interface AdminUser {
  id: string;
  email: string | null;
  name: string | null;
  adminRole: 'SUPER_ADMIN' | 'OPERATIONS' | 'FINANCE' | 'SUPPORT';
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  lastLoginAt: string | null;
  createdAt: string;
}

/** GET /admin/cities — includes inactive cities and the operational fields the public list omits. */
export interface AdminCity {
  id: number;
  name: string;
  nameUr: string | null;
  code: string | null;
  isActive: boolean;
  deliveryFee: string;
  timezone: string;
  courierPartnerId: string | null;
  courierPartner: { id: string; code: string; name: string; isActive: boolean } | null;
  _count: { vendors: number };
}

export interface QueueFailure {
  id: string;
  name: string;
  reason: string;
  attemptsMade: number;
  failedAt: string;
}

export interface QueueHealth {
  queue: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  stuck: number;
  oldestWaitingSec: number;
  recentFailures: QueueFailure[];
  healthy: boolean;
}

export interface QueuesReport {
  healthy: boolean;
  queues: QueueHealth[];
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

/** GET /admin/analytics/vendors — the leaderboard, already ranked by the API. */
export interface TopVendor {
  rank: number;
  vendorId: string;
  businessName: string;
  cityId: number | null;
  city: string | null;
  ordersDelivered: number;
  gmv: string;
  revenue: string;
  vendorEarnings: string;
  ratingAvg: string | null;
  ratingCount: number;
}

export interface TopVendorsResponse {
  range: { from: string; to: string; cityId: number | null };
  vendors: TopVendor[];
}
