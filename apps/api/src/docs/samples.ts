/**
 * Realistic sample values reused across the API docs so every example tells one consistent story:
 * customer Ayesha Khan orders from "Sparkle Laundry" in Lahore.
 */
export const ID = {
  user: '3f6c1f0e-8c1a-4a53-9f55-6a1c1c0b2a01',
  staff: '5a9d7e12-2b34-4c56-8d78-9e0f1a2b3c4d',
  vendor: '7b0f2d9a-5d61-4a0b-9d0e-2f6a3c5e8b11',
  order: '9c4e6a52-1b7d-4e3a-8f2c-5d9a0b3e7c21',
  item: 'c2d8e4f0-3a9b-4c7d-b1e5-8f6a2d4c9e31',
  item2: 'd4e9f5a1-4b0c-4d8e-a2f6-9a7b3e5d0f42',
  address: 'e1a7b3c9-4d2f-4b8a-9c6e-3f5d1a7b9c41',
  notification: 'f3b8c4d0-5e1a-4f9b-b3a7-0c6e2d4f8a52',
  request: 'b7d1e9c3-6a2f-4e84-95d0-1a3c5e7f9b60',
  payment: 'a8c2e4f6-7b1d-4c3e-9a5f-2d8b0c6e4f73',
  payout: 'c5e1a7b3-8d2f-4e6c-b0a4-7f3d9e1c5b84',
  commissionRule: 'd7f3b9c5-1e4a-4b8d-a6c2-9e5f0d7a3c95',
  settlement: 'e9a5c1d7-3f6b-4d2e-8c0a-1b7d5f9e3a06',
  codCollection: 'f1b7d3e9-5a8c-4f0b-b2d6-3c9e7a1f5d17',
} as const;

export const PHONE = { local: '03001234567', e164: '+923001234567', vendor: '+923000000011' } as const;
export const TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzZjZjMWYwZS04YzFhLTRhNTMtOWY1NS02YTFjMWMwYjJhMDEiLCJyb2xlIjoiQ1VTVE9NRVIiLCJzaWQiOiIxMjM0IiwiaWF0IjoxNzkyNjc1MDU1LCJleHAiOjE3OTI2NzU5NTV9.signature';

export const SLOT = {
  pickupStart: '2026-10-24T05:00:00.000Z',
  pickupEnd: '2026-10-24T06:00:00.000Z',
  deliveryStart: '2026-10-26T06:00:00.000Z',
  deliveryEnd: '2026-10-26T07:00:00.000Z',
} as const;

export const SAMPLE_USER = {
  id: ID.user,
  phone: PHONE.e164,
  email: null,
  name: 'Ayesha Khan',
  role: 'CUSTOMER',
  locale: 'EN',
  referralCode: 'Q35M9QBH',
  createdAt: '2026-10-22T13:17:35.559Z',
};

export const SAMPLE_ADDRESS = {
  id: ID.address,
  label: 'Home',
  line1: '14 Model Town',
  line2: null,
  area: 'Model Town',
  cityId: 1,
  lat: 31.521,
  lng: 74.359,
  isDefault: true,
  createdAt: '2026-10-22T13:17:36.170Z',
};

export const SAMPLE_VENDOR_CARD = {
  id: ID.vendor,
  businessName: 'Sparkle Laundry',
  description: 'Wash, iron and dry clean. Free fold.',
  cityId: 1,
  lat: 31.523,
  lng: 74.361,
  distanceKm: 0.46,
  ratingAvg: 4.6,
  ratingCount: 128,
  serviceRadiusKm: 10,
  minPrice: '50.00',
  minTurnaroundHours: 24,
  serviceTypes: ['WASH_IRON', 'DRY_CLEAN', 'IRON_ONLY'],
};

export const SAMPLE_ITEM = {
  id: ID.item,
  categoryId: 2,
  category: { id: 2, name: 'Wash & Iron', nameUr: 'دھلائی اور استری' },
  itemName: 'Shirt',
  itemNameUr: 'قمیض',
  serviceType: 'WASH_IRON',
  price: '120.00',
  turnaroundHours: 48,
  isActive: true,
  createdAt: '2026-10-20T09:00:00.000Z',
  updatedAt: '2026-10-22T09:00:00.000Z',
};

export const SAMPLE_QUOTE = {
  vendor: { id: ID.vendor, businessName: 'Sparkle Laundry', availability: 'OPEN' },
  currency: 'PKR',
  lines: [
    { serviceItemId: ID.item, name: 'Shirt', nameUr: 'قمیض', serviceType: 'WASH_IRON', unitPrice: '120.00', qty: 3, lineTotal: '360.00', turnaroundHours: 48 },
  ],
  subtotal: '360.00',
  deliveryFee: '150.00',
  discountTotal: '0.00',
  total: '510.00',
  maxTurnaroundHours: 48,
  warnings: [] as string[],
};

export const SAMPLE_CART = {
  vendorId: ID.vendor,
  vendorName: 'Sparkle Laundry',
  vendorAvailable: true,
  updatedAt: '2026-10-22T13:30:00.000Z',
  items: [
    { serviceItemId: ID.item, name: 'Shirt', nameUr: 'قمیض', serviceType: 'WASH_IRON', qty: 3, unitPrice: '120.00', lineTotal: '360.00', turnaroundHours: 48, available: true },
  ],
  subtotal: '360.00',
  unavailableCount: 0,
};

export const SAMPLE_ORDER = {
  id: ID.order,
  orderNo: 'DHB-LHR-000123',
  status: 'PLACED',
  currency: 'PKR',
  vendor: { id: ID.vendor, businessName: 'Sparkle Laundry' },
  addressSnapshot: { label: 'Home', line1: '14 Model Town', line2: null, area: 'Model Town', cityId: 1, lat: 31.521, lng: 74.359 },
  pickupSlotStart: SLOT.pickupStart,
  pickupSlotEnd: SLOT.pickupEnd,
  deliverySlotStart: SLOT.deliveryStart,
  deliverySlotEnd: SLOT.deliveryEnd,
  subtotal: '360.00',
  discountTotal: '0.00',
  deliveryFee: '150.00',
  total: '510.00',
  paymentMethod: 'COD',
  paymentStatus: 'COD_PENDING',
  customerNote: 'Please fold gently',
  vendorRespondBy: '2026-10-22T13:47:00.000Z',
  rejectionReason: null,
  cancelReason: null,
  placedAt: '2026-10-22T13:32:00.000Z',
  acceptedAt: null,
  pickedUpAt: null,
  readyAt: null,
  deliveredAt: null,
  items: [{ id: ID.request, serviceItemId: ID.item, name: 'Shirt', nameUr: 'قمیض', serviceType: 'WASH_IRON', unitPrice: '120.00', qty: 3, lineTotal: '360.00' }],
};

export const SAMPLE_ORDER_SUMMARY = {
  id: ID.order,
  orderNo: 'DHB-LHR-000123',
  status: 'PLACED',
  vendor: { id: ID.vendor, businessName: 'Sparkle Laundry' },
  total: '510.00',
  paymentMethod: 'COD',
  paymentStatus: 'COD_PENDING',
  pickupSlotStart: SLOT.pickupStart,
  deliverySlotStart: SLOT.deliveryStart,
  placedAt: '2026-10-22T13:32:00.000Z',
  itemCount: 1,
  currency: 'PKR',
};

export const SAMPLE_TIMELINE = [
  { status: 'PLACED', from: null, at: '2026-10-22T13:32:00.000Z', by: 'CUSTOMER', note: null },
  { status: 'ACCEPTED', from: 'PLACED', at: '2026-10-22T13:35:12.000Z', by: 'VENDOR', note: null },
];

export const SAMPLE_VENDOR_PROFILE = {
  id: ID.vendor,
  businessName: 'Sparkle Laundry',
  description: 'Wash, iron and dry clean. Free fold.',
  addressLine: 'Main Market, Model Town',
  cityId: 1,
  lat: 31.523,
  lng: 74.361,
  status: 'APPROVED',
  rejectionReason: null,
  availability: 'OPEN',
  serviceRadiusKm: '10',
  respondWithinMin: 15,
  slotCapacity: 10,
  ratingAvg: '4.60',
  ratingCount: 128,
  approvedAt: '2026-10-20T08:00:00.000Z',
  createdAt: '2026-10-19T10:00:00.000Z',
  documents: [
    { type: 'CNIC_FRONT', verifiedAt: '2026-10-20T08:00:00.000Z' },
    { type: 'CNIC_BACK', verifiedAt: '2026-10-20T08:00:00.000Z' },
    { type: 'SHOP_PHOTO', verifiedAt: '2026-10-20T08:00:00.000Z' },
  ],
};

export const SAMPLE_BOARD_ROW = {
  id: ID.order,
  orderNo: 'DHB-LHR-000123',
  status: 'PLACED',
  placedAt: '2026-10-22T13:32:00.000Z',
  vendorRespondBy: '2026-10-22T13:47:00.000Z',
  respondBy: '2026-10-22T13:47:00.000Z',
  pickupSlotStart: SLOT.pickupStart,
  pickupSlotEnd: SLOT.pickupEnd,
  deliverySlotStart: SLOT.deliveryStart,
  deliverySlotEnd: SLOT.deliveryEnd,
  total: '510.00',
  vendorEarning: '306.00',
  paymentMethod: 'COD',
  paymentStatus: 'COD_PENDING',
  customerName: 'Ayesha Khan',
  itemCount: 1,
};

export const SAMPLE_VENDOR_ORDER = {
  id: ID.order,
  orderNo: 'DHB-LHR-000123',
  status: 'PLACED',
  currency: 'PKR',
  placedAt: '2026-10-22T13:32:00.000Z',
  acceptedAt: null,
  pickedUpAt: null,
  readyAt: null,
  deliveredAt: null,
  vendorRespondBy: '2026-10-22T13:47:00.000Z',
  rejectionReason: null,
  cancelReason: null,
  customerNote: 'Please fold gently',
  addressSnapshot: SAMPLE_ORDER.addressSnapshot,
  pickupSlotStart: SLOT.pickupStart,
  pickupSlotEnd: SLOT.pickupEnd,
  deliverySlotStart: SLOT.deliveryStart,
  deliverySlotEnd: SLOT.deliveryEnd,
  subtotal: '360.00',
  discountTotal: '0.00',
  deliveryFee: '150.00',
  total: '510.00',
  commissionRatePct: '15.00',
  commissionAmount: '54.00',
  vendorEarning: '306.00',
  paymentMethod: 'COD',
  paymentStatus: 'COD_PENDING',
  customer: { name: 'Ayesha Khan', phone: '+92300***4567' },
  items: [{ id: ID.request, name: 'Shirt', nameUr: 'قمیض', serviceType: 'WASH_IRON', unitPrice: '120.00', qty: 3, lineTotal: '360.00' }],
  nextActions: ['ACCEPTED', 'REJECTED'],
  timeline: [SAMPLE_TIMELINE[0]],
};

export const SAMPLE_ADMIN_ORDER = {
  id: ID.order,
  orderNo: 'DHB-LHR-000123',
  status: 'PLACED',
  currency: 'PKR',
  vendor: { id: ID.vendor, businessName: 'Sparkle Laundry' },
  customer: { id: ID.user, name: 'Ayesha Khan', phone: PHONE.e164 },
  addressSnapshot: SAMPLE_ORDER.addressSnapshot,
  pickupSlotStart: SLOT.pickupStart,
  pickupSlotEnd: SLOT.pickupEnd,
  deliverySlotStart: SLOT.deliveryStart,
  deliverySlotEnd: SLOT.deliveryEnd,
  subtotal: '360.00',
  discountTotal: '0.00',
  deliveryFee: '150.00',
  total: '510.00',
  commissionRatePct: '15.00',
  commissionAmount: '54.00',
  vendorEarning: '306.00',
  paymentMethod: 'COD',
  paymentStatus: 'COD_PENDING',
  customerNote: 'Please fold gently',
  vendorRespondBy: '2026-10-22T13:47:00.000Z',
  rejectionReason: null,
  cancelReason: null,
  placedAt: '2026-10-22T13:32:00.000Z',
  acceptedAt: null,
  pickedUpAt: null,
  readyAt: null,
  deliveredAt: null,
  items: [{ id: ID.request, serviceItemId: ID.item, name: 'Shirt', nameUr: 'قمیض', serviceType: 'WASH_IRON', unitPrice: '120.00', qty: 3, lineTotal: '360.00' }],
  payments: [{ id: ID.notification, method: 'COD', gateway: 'cod', gatewayRef: null, amount: '510.00', status: 'COD_PENDING', createdAt: '2026-10-22T13:32:00.000Z' }],
  nextActions: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  timeline: [{ seq: 1042, status: 'PLACED', from: null, at: '2026-10-22T13:32:00.000Z', by: 'CUSTOMER', actorId: ID.user, note: null }],
};

export const REQUEST_ID = ID.request;
