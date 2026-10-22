import { Prisma } from '@prisma/client';
import { fmt, money } from '../../common/money/money';

/** What a customer may see of an order. Commission and vendor earning are internal and never selected. */
export const orderSelect = {
  id: true,
  orderNo: true,
  status: true,
  vendorId: true,
  vendor: { select: { id: true, businessName: true } },
  addressSnapshot: true,
  pickupSlotStart: true,
  pickupSlotEnd: true,
  deliverySlotStart: true,
  deliverySlotEnd: true,
  subtotal: true,
  discountTotal: true,
  deliveryFee: true,
  total: true,
  paymentMethod: true,
  paymentStatus: true,
  customerNote: true,
  vendorRespondBy: true,
  rejectionReason: true,
  cancelReason: true,
  placedAt: true,
  acceptedAt: true,
  pickedUpAt: true,
  readyAt: true,
  deliveredAt: true,
  items: { select: { id: true, serviceItemId: true, name: true, nameUr: true, serviceType: true, unitPrice: true, qty: true, lineTotal: true } },
} satisfies Prisma.OrderSelect;

export const orderSummarySelect = {
  id: true,
  orderNo: true,
  status: true,
  vendor: { select: { id: true, businessName: true } },
  total: true,
  paymentMethod: true,
  paymentStatus: true,
  pickupSlotStart: true,
  deliverySlotStart: true,
  placedAt: true,
  createdAt: true,
  _count: { select: { items: true } },
} satisfies Prisma.OrderSelect;

type OrderRow = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;
type SummaryRow = Prisma.OrderGetPayload<{ select: typeof orderSummarySelect }>;

export function toOrderView(o: OrderRow) {
  const { items, vendorId: _vendorId, ...rest } = o;
  return {
    ...rest,
    currency: 'PKR',
    subtotal: fmt(money(o.subtotal)),
    discountTotal: fmt(money(o.discountTotal)),
    deliveryFee: fmt(money(o.deliveryFee)),
    total: fmt(money(o.total)),
    items: items.map((i) => ({ ...i, unitPrice: fmt(money(i.unitPrice)), lineTotal: fmt(money(i.lineTotal)) })),
  };
}

export function toOrderSummary(o: SummaryRow) {
  const { _count, createdAt: _createdAt, ...rest } = o;
  return { ...rest, total: fmt(money(o.total)), itemCount: _count.items, currency: 'PKR' };
}
