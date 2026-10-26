import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { dayBounds } from '../../common/time/date-range';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ZERO, money, sum } from '../../common/money/money';

export interface VendorDay {
  vendorId: string;
  cityId: number;
  ordersPlaced: number;
  ordersDelivered: number;
  ordersCancelled: number;
  gmv: Prisma.Decimal;
  commission: Prisma.Decimal;
  vendorEarnings: Prisma.Decimal;
  deliveryFees: Prisma.Decimal;
  discounts: Prisma.Decimal;
  codGmv: Prisma.Decimal;
}

export interface CityDay extends Omit<VendorDay, 'vendorId'> {
  activeCustomers: number;
  newCustomers: number;
}

export interface DayStats {
  cities: CityDay[];
  vendors: VendorDay[];
}

type Row = Record<string, unknown>;

const blank = (vendorId: string, cityId: number): VendorDay => ({
  vendorId,
  cityId,
  ordersPlaced: 0,
  ordersDelivered: 0,
  ordersCancelled: 0,
  gmv: ZERO,
  commission: ZERO,
  vendorEarnings: ZERO,
  deliveryFees: ZERO,
  discounts: ZERO,
  codGmv: ZERO,
});

/**
 * The single definition of the daily numbers (TRD §9 `analytics`). A "day" is a Pakistan-time calendar day, and
 * every figure is attributed to the day its event happened:
 * - placed: the order was created that day
 * - delivered / gmv / commission / vendorEarnings / deliveryFees / discounts: orders delivered that day
 * - cancelled: orders that moved to CANCELLED or REJECTED that day
 * - newCustomers: customers whose first-ever order was placed that day
 * Because a delivery or cancellation always happens "now", a finished day never changes afterwards, which is what
 * makes it safe to store its rollup once.
 */
@Injectable()
export class DayStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async compute(day: string): Promise<DayStats> {
    const { start, end } = dayBounds(day);
    const [placed, delivered, cancelled, active, fresh] = await Promise.all([
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT "vendorId", "cityId", COUNT(*)::int AS n FROM "Order"
        WHERE "createdAt" >= ${start} AND "createdAt" < ${end} GROUP BY 1, 2`),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT "vendorId", "cityId", COUNT(*)::int AS n,
          COALESCE(SUM("total"), 0) AS gmv, COALESCE(SUM("commissionAmount"), 0) AS commission,
          COALESCE(SUM("vendorEarning"), 0) AS earnings, COALESCE(SUM("deliveryFee"), 0) AS fees,
          COALESCE(SUM("discountTotal"), 0) AS discounts,
          COALESCE(SUM("total") FILTER (WHERE "paymentMethod" = 'COD'), 0) AS cod
        FROM "Order"
        WHERE "status" = 'DELIVERED' AND "deliveredAt" >= ${start} AND "deliveredAt" < ${end} GROUP BY 1, 2`),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT o."vendorId", o."cityId", COUNT(DISTINCT o."id")::int AS n
        FROM "OrderStatusHistory" h JOIN "Order" o ON o."id" = h."orderId"
        WHERE h."toStatus" IN ('CANCELLED', 'REJECTED') AND h."createdAt" >= ${start} AND h."createdAt" < ${end} GROUP BY 1, 2`),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT "cityId", COUNT(DISTINCT "customerId")::int AS n FROM "Order"
        WHERE "createdAt" >= ${start} AND "createdAt" < ${end} GROUP BY 1`),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT o."cityId", COUNT(DISTINCT o."customerId")::int AS n FROM "Order" o
        WHERE o."createdAt" >= ${start} AND o."createdAt" < ${end}
          AND NOT EXISTS (SELECT 1 FROM "Order" p WHERE p."customerId" = o."customerId" AND p."createdAt" < ${start})
        GROUP BY 1`),
    ]);

    const vendors = new Map<string, VendorDay>();
    const at = (r: Row) => {
      const key = String(r.vendorId);
      let v = vendors.get(key);
      if (!v) vendors.set(key, (v = blank(key, Number(r.cityId))));
      return v;
    };
    for (const r of placed) at(r).ordersPlaced = Number(r.n);
    for (const r of cancelled) at(r).ordersCancelled = Number(r.n);
    for (const r of delivered) {
      const v = at(r);
      v.ordersDelivered = Number(r.n);
      v.gmv = money(r.gmv as Prisma.Decimal.Value);
      v.commission = money(r.commission as Prisma.Decimal.Value);
      v.vendorEarnings = money(r.earnings as Prisma.Decimal.Value);
      v.deliveryFees = money(r.fees as Prisma.Decimal.Value);
      v.discounts = money(r.discounts as Prisma.Decimal.Value);
      v.codGmv = money(r.cod as Prisma.Decimal.Value);
    }

    const byCity = new Map<number, CityDay>();
    for (const v of vendors.values()) {
      const { vendorId: _unused, ...empty } = blank(v.vendorId, v.cityId);
      const c: CityDay = byCity.get(v.cityId) ?? { ...empty, activeCustomers: 0, newCustomers: 0 };
      c.ordersPlaced += v.ordersPlaced;
      c.ordersDelivered += v.ordersDelivered;
      c.ordersCancelled += v.ordersCancelled;
      c.gmv = sum([c.gmv, v.gmv]);
      c.commission = sum([c.commission, v.commission]);
      c.vendorEarnings = sum([c.vendorEarnings, v.vendorEarnings]);
      c.deliveryFees = sum([c.deliveryFees, v.deliveryFees]);
      c.discounts = sum([c.discounts, v.discounts]);
      c.codGmv = sum([c.codGmv, v.codGmv]);
      byCity.set(v.cityId, c);
    }
    for (const r of active) {
      const c = byCity.get(Number(r.cityId));
      if (c) c.activeCustomers = Number(r.n);
    }
    for (const r of fresh) {
      const c = byCity.get(Number(r.cityId));
      if (c) c.newCustomers = Number(r.n);
    }
    return { cities: [...byCity.values()], vendors: [...vendors.values()] };
  }
}
