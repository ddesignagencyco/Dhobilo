import type { TemplateLocale } from './templates/order-templates';
import type { OrderCardData } from './templates/email';

/** The order fields the email card needs; the orchestrator selects exactly these. */
export interface OrderForEmail {
  orderNo: string;
  subtotal: { toString(): string };
  discountTotal: { toString(): string };
  deliveryFee: { toString(): string };
  total: { toString(): string };
  pickupSlotStart: Date;
  pickupSlotEnd: Date;
  deliverySlotStart: Date;
  deliverySlotEnd: Date;
  addressSnapshot: unknown;
  paymentMethod: string;
  items: { name: string; nameUr: string | null; qty: number; lineTotal: { toString(): string } }[];
  vendor: { businessName: string };
}

/** `Rs 1,670` (decimals only when there are some). Latin digits in both languages, as the glossary requires. */
export function rs(value: { toString(): string } | string | number): string {
  const n = Number(value.toString());
  return `Rs ${n.toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
}

const TZ = 'Asia/Karachi';

/** `Sat, 8 Nov, 10:00 am - 11:00 am` in Pakistan time, with Latin digits even in Urdu. */
export function slotRange(start: Date, end: Date, locale: TemplateLocale): string {
  const tag = locale === 'ur' ? 'ur-PK-u-nu-latn' : 'en-GB';
  const parts = new Intl.DateTimeFormat(tag, { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).formatToParts(start);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const day = `${get('weekday')}, ${get('day')} ${get('month')}`;
  const time = new Intl.DateTimeFormat(locale === 'ur' ? tag : 'en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });
  return `${day}, ${time.format(start).toLowerCase()} - ${time.format(end).toLowerCase()}`;
}

function addressLine(snapshot: unknown): string | undefined {
  if (!snapshot || typeof snapshot !== 'object') return undefined;
  const a = snapshot as Record<string, unknown>;
  const parts = [a.line1, a.line2, a.area].filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
  return parts.length ? parts.join(', ') : undefined;
}

const PAYMENT: Record<string, { en: string; ur: string }> = {
  COD: { en: 'Cash on delivery', ur: 'ڈیلیوری پر ادائیگی' },
};

export function orderCard(o: OrderForEmail, locale: TemplateLocale): OrderCardData {
  const discount = Number(o.discountTotal.toString());
  const fee = Number(o.deliveryFee.toString());
  return {
    orderNo: o.orderNo,
    shop: o.vendor.businessName,
    items: o.items.map((it) => ({ name: locale === 'ur' && it.nameUr ? it.nameUr : it.name, qty: it.qty, amount: rs(it.lineTotal) })),
    subtotal: rs(o.subtotal),
    deliveryFee: fee > 0 ? rs(o.deliveryFee) : undefined,
    discount: discount > 0 ? rs(o.discountTotal) : undefined,
    total: rs(o.total),
    pickup: slotRange(o.pickupSlotStart, o.pickupSlotEnd, locale),
    delivery: slotRange(o.deliverySlotStart, o.deliverySlotEnd, locale),
    address: addressLine(o.addressSnapshot),
    payment: PAYMENT[o.paymentMethod]?.[locale] ?? o.paymentMethod,
  };
}
