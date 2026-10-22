import { HttpStatus, Injectable } from '@nestjs/common';
import { Availability, Prisma, ServiceType } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { Money, ZERO, fmt, money, sum } from '../../common/money/money';
import { PrismaService } from '../../infra/prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

export const MAX_LINE_QTY = 50;
export const MAX_LINES = 30;

export interface RequestedLine {
  serviceItemId: string;
  qty: number;
}

export interface QuotedVendor {
  id: string;
  businessName: string;
  availability: Availability;
  lat: number;
  lng: number;
  serviceRadiusKm: number;
  respondWithinMin: number;
  slotCapacity: number;
  cityId: number;
  city: { id: number; name: string; code: string | null; timezone: string; deliveryFee: Prisma.Decimal };
  hours: { dayOfWeek: number; opensAt: number; closesAt: number }[];
}

export interface QuoteLine {
  serviceItemId: string;
  name: string;
  nameUr: string | null;
  serviceType: ServiceType;
  categoryId: number;
  unitPrice: Money;
  qty: number;
  lineTotal: Money;
  turnaroundHours: number;
}

export interface Quote {
  vendor: QuotedVendor;
  lines: QuoteLine[];
  subtotal: Money;
  deliveryFee: Money;
  discountTotal: Money;
  total: Money;
  maxTurnaroundHours: number;
}

/** Same item listed twice -> one line with the quantities added; reject absurd totals. */
export function mergeLines(lines: RequestedLine[]): RequestedLine[] {
  const merged = new Map<string, number>();
  for (const l of lines) merged.set(l.serviceItemId, (merged.get(l.serviceItemId) ?? 0) + l.qty);
  if (merged.size > MAX_LINES) {
    throw new AppException('CART_TOO_LARGE', `At most ${MAX_LINES} different items per order.`, HttpStatus.BAD_REQUEST);
  }
  for (const [serviceItemId, qty] of merged) {
    if (qty > MAX_LINE_QTY) {
      throw new AppException('QUANTITY_TOO_LARGE', `At most ${MAX_LINE_QTY} of one item per order.`, HttpStatus.BAD_REQUEST, { serviceItemId });
    }
  }
  return [...merged].map(([serviceItemId, qty]) => ({ serviceItemId, qty }));
}

/** Wire format for a quote: money as 2-decimal strings, no internal ids (categoryId) or commission. */
export function toQuoteView(q: Quote) {
  return {
    vendor: { id: q.vendor.id, businessName: q.vendor.businessName, availability: q.vendor.availability },
    currency: 'PKR',
    lines: q.lines.map((l) => ({
      serviceItemId: l.serviceItemId,
      name: l.name,
      nameUr: l.nameUr,
      serviceType: l.serviceType,
      unitPrice: fmt(l.unitPrice),
      qty: l.qty,
      lineTotal: fmt(l.lineTotal),
      turnaroundHours: l.turnaroundHours,
    })),
    subtotal: fmt(q.subtotal),
    deliveryFee: fmt(q.deliveryFee),
    discountTotal: fmt(q.discountTotal),
    total: fmt(q.total),
    maxTurnaroundHours: q.maxTurnaroundHours,
    warnings: q.vendor.availability === 'OPEN' ? [] : ['VENDOR_NOT_ACCEPTING_ORDERS'],
  };
}

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Prices an order from current catalog prices, server side (FR-C5). Used for the estimate and, with the
   * same code, when the order is placed, so the number a customer confirmed is the number charged.
   */
  async quote(db: Db, vendorId: string, requested: RequestedLine[]): Promise<Quote> {
    const lines = mergeLines(requested);
    if (lines.length === 0) throw new AppException('CART_EMPTY', 'Add at least one item.', HttpStatus.BAD_REQUEST);

    const vendor = await this.loadVendor(db, vendorId);
    const items = await db.serviceItem.findMany({
      where: { id: { in: lines.map((l) => l.serviceItemId) }, vendorId, isActive: true, deletedAt: null },
      select: { id: true, itemName: true, itemNameUr: true, serviceType: true, categoryId: true, price: true, turnaroundHours: true },
    });
    const byId = new Map(items.map((i) => [i.id, i]));

    const unavailable = lines.filter((l) => !byId.has(l.serviceItemId)).map((l) => l.serviceItemId);
    if (unavailable.length) {
      throw new AppException('ITEM_UNAVAILABLE', 'Some items are no longer available from this vendor.', HttpStatus.UNPROCESSABLE_ENTITY, { unavailable });
    }

    const quoted: QuoteLine[] = lines.map((l) => {
      const item = byId.get(l.serviceItemId)!;
      const unitPrice = money(item.price);
      return {
        serviceItemId: item.id,
        name: item.itemName,
        nameUr: item.itemNameUr,
        serviceType: item.serviceType,
        categoryId: item.categoryId,
        unitPrice,
        qty: l.qty,
        lineTotal: unitPrice.mul(l.qty),
        turnaroundHours: item.turnaroundHours,
      };
    });

    const subtotal = sum(quoted.map((l) => l.lineTotal));
    const deliveryFee = money(vendor.city.deliveryFee);
    const discountTotal = ZERO; // promo codes arrive in Phase 7
    return {
      vendor,
      lines: quoted,
      subtotal,
      deliveryFee,
      discountTotal,
      total: subtotal.plus(deliveryFee).minus(discountTotal),
      maxTurnaroundHours: Math.max(...quoted.map((l) => l.turnaroundHours)),
    };
  }

  /** Customer-facing vendor lookup: only APPROVED vendors in an active city exist for customers. */
  async loadVendor(db: Db, vendorId: string): Promise<QuotedVendor> {
    const v = await db.vendor.findFirst({
      where: { id: vendorId, status: 'APPROVED', city: { isActive: true } },
      select: {
        id: true,
        businessName: true,
        availability: true,
        lat: true,
        lng: true,
        serviceRadiusKm: true,
        respondWithinMin: true,
        slotCapacity: true,
        cityId: true,
        city: { select: { id: true, name: true, code: true, timezone: true, deliveryFee: true } },
        hours: { select: { dayOfWeek: true, opensAt: true, closesAt: true } },
      },
    });
    if (!v) throw new AppException(ErrorCode.NOT_FOUND, 'Vendor not found.', HttpStatus.NOT_FOUND);
    return { ...v, serviceRadiusKm: Number(v.serviceRadiusKm) };
  }
}
