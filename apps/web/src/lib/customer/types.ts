/** Shapes returned by the public/customer API routes used by the customer app. */

export interface ActiveCity {
  id: number;
  name: string;
  nameUr: string;
  timezone: string;
}

export interface CustomerProfile {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  role: string;
  locale: 'EN' | 'UR';
  referralCode: string | null;
}

export interface Address {
  id: string;
  label: string | null;
  line1: string;
  line2: string | null;
  area: string | null;
  cityId: number;
  lat: string;
  lng: string;
  isDefault: boolean;
  createdAt: string;
}

export interface VendorCard {
  id: string;
  businessName: string;
  description: string | null;
  cityId: number;
  lat: number;
  lng: number;
  distanceKm: number;
  ratingAvg: number;
  ratingCount: number;
  serviceRadiusKm: number;
  minPrice: string;
  minTurnaroundHours: number;
  serviceTypes: string[];
}

export interface VendorHours {
  dayOfWeek: number;
  opensAt: number;
  closesAt: number;
}

export interface VendorCity {
  id: number;
  name: string;
  nameUr: string;
  timezone: string;
  deliveryFee: string;
}

export interface PublicVendorDetail {
  id: string;
  businessName: string;
  description: string | null;
  addressLine: string | null;
  cityId: number;
  lat: string;
  lng: string;
  availability: string;
  serviceRadiusKm: number;
  respondWithinMin: number;
  ratingAvg: string | number;
  ratingCount: number;
  city: VendorCity;
  hours: VendorHours[];
  minPrice: string | null;
  minTurnaroundHours: number | null;
  serviceTypes: string[];
  openNow: boolean;
}

export interface CatalogItem {
  id: string;
  itemName: string;
  itemNameUr: string | null;
  serviceType: string;
  price: string;
  turnaroundHours: number;
}

export interface CatalogCategory {
  id: number;
  name: string;
  nameUr: string;
  items: CatalogItem[];
}

export interface VendorCatalog {
  vendorId: string;
  currency: string;
  categories: CatalogCategory[];
}

export interface SlotWindow {
  start: string;
  end: string;
  available: boolean;
  remaining: number;
}

export interface SlotResponse {
  date: string;
  timezone: string;
  type: 'pickup' | 'delivery';
  slotMinutes: number;
  capacity: number;
  slots: SlotWindow[];
}

export interface EstimateLine {
  serviceItemId: string;
  name: string;
  nameUr: string | null;
  serviceType: string;
  qty: number;
  unitPrice: string;
  lineTotal: string;
  turnaroundHours: number;
}

export interface CartEstimate {
  vendor: { id: string; businessName: string; availability: string };
  currency: string;
  subtotal: string;
  deliveryFee: string;
  discountTotal: string;
  total: string;
  maxTurnaroundHours: number;
  lines: EstimateLine[];
  warnings: string[];
  promo: { code: string; discountTotal: string } | null;
}

export interface OrderItemView {
  id: string;
  serviceItemId: string | null;
  name: string;
  nameUr: string | null;
  serviceType: string;
  unitPrice: string;
  qty: number;
  lineTotal: string;
}

export interface OrderSummaryView {
  id: string;
  orderNo: string;
  status: string;
  vendor: { id: string; businessName: string };
  total: string;
  currency: string;
  paymentMethod: string;
  paymentStatus: string;
  pickupSlotStart: string;
  deliverySlotStart: string;
  placedAt: string;
  itemCount: number;
}

export interface OrderDetailView {
  id: string;
  orderNo: string;
  status: string;
  vendor: { id: string; businessName: string };
  addressSnapshot: {
    label: string | null;
    line1: string;
    line2: string | null;
    area: string | null;
    cityId: number;
    lat: string;
    lng: string;
  };
  pickupSlotStart: string;
  pickupSlotEnd: string;
  deliverySlotStart: string;
  deliverySlotEnd: string;
  subtotal: string;
  discountTotal: string;
  deliveryFee: string;
  total: string;
  currency: string;
  paymentMethod: string;
  paymentStatus: string;
  customerNote: string | null;
  promoCode: string | null;
  rejectionReason: string | null;
  cancelReason: string | null;
  placedAt: string;
  acceptedAt: string | null;
  pickedUpAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
  items: OrderItemView[];
}

export interface OrderTimelineEntry {
  status: string;
  from: string | null;
  at: string;
  by: string;
  note: string | null;
}
