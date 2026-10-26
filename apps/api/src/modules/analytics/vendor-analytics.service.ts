import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { fmt, money } from '../../common/money/money';
import { Clock } from '../../common/time/clock';
import { resolveDayRange } from '../../common/time/date-range';
import { localParts } from '../../common/time/zoned';
import { PrismaService } from '../../infra/prisma/prisma.service';

const TZ = 'Asia/Karachi';
const OPEN_STATUSES = [OrderStatus.PLACED, OrderStatus.ACCEPTED, OrderStatus.PICKED_UP, OrderStatus.IN_PROCESS, OrderStatus.READY, OrderStatus.OUT_FOR_DELIVERY];

type Row = Record<string, unknown>;

/** A vendor's own numbers (SRS §9.1 "View analytics"): live queries over just their orders, so always current. */
@Injectable()
export class VendorAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async summary(vendorId: string, days: 7 | 30 | 90 = 7) {
    const today = localParts(this.clock.now(), TZ).date;
    const range = resolveDayRange({ to: today }, today, { defaultDays: days, maxDays: days });

    const [placed, delivered, closed, open, topServices, ratings] = await Promise.all([
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT ("createdAt" AT TIME ZONE 'Asia/Karachi')::date::text AS day, COUNT(*)::int AS n FROM "Order"
        WHERE "vendorId" = ${vendorId}::uuid AND "createdAt" >= ${range.start} AND "createdAt" < ${range.end} GROUP BY 1`),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT ("deliveredAt" AT TIME ZONE 'Asia/Karachi')::date::text AS day, COUNT(*)::int AS n,
          COALESCE(SUM("total"), 0) AS gmv, COALESCE(SUM("commissionAmount"), 0) AS commission, COALESCE(SUM("vendorEarning"), 0) AS earnings
        FROM "Order" WHERE "vendorId" = ${vendorId}::uuid AND "status" = 'DELIVERED' AND "deliveredAt" >= ${range.start} AND "deliveredAt" < ${range.end} GROUP BY 1`),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT (h."createdAt" AT TIME ZONE 'Asia/Karachi')::date::text AS day, h."toStatus"::text AS status, COUNT(DISTINCT h."orderId")::int AS n
        FROM "OrderStatusHistory" h JOIN "Order" o ON o."id" = h."orderId"
        WHERE o."vendorId" = ${vendorId}::uuid AND h."toStatus" IN ('CANCELLED', 'REJECTED') AND h."createdAt" >= ${range.start} AND h."createdAt" < ${range.end} GROUP BY 1, 2`),
      this.prisma.order.groupBy({ by: ['status'], where: { vendorId, status: { in: OPEN_STATUSES } }, _count: { _all: true } }),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT i."name", SUM(i."qty")::int AS qty, SUM(i."lineTotal") AS revenue
        FROM "OrderItem" i JOIN "Order" o ON o."id" = i."orderId"
        WHERE o."vendorId" = ${vendorId}::uuid AND o."status" = 'DELIVERED' AND o."deliveredAt" >= ${range.start} AND o."deliveredAt" < ${range.end}
        GROUP BY i."name" ORDER BY SUM(i."lineTotal") DESC, i."name" LIMIT 5`),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT to_char(date_trunc('week', "createdAt" AT TIME ZONE 'Asia/Karachi'), 'YYYY-MM-DD') AS week,
          ROUND(AVG("rating")::numeric, 2) AS avg, COUNT(*)::int AS n
        FROM "Review" WHERE "vendorId" = ${vendorId}::uuid AND "targetType" = 'VENDOR'
          AND "createdAt" >= ${this.clock.now()}::timestamp - interval '8 weeks'
        GROUP BY 1 ORDER BY 1`),
    ]);

    const placedBy = new Map(placed.map((r) => [String(r.day), Number(r.n)]));
    const deliveredBy = new Map(delivered.map((r) => [String(r.day), r]));
    const series = range.days.map((day) => {
      const d = deliveredBy.get(day);
      return {
        day,
        ordersPlaced: placedBy.get(day) ?? 0,
        ordersDelivered: d ? Number(d.n) : 0,
        sales: fmt(money((d?.gmv ?? 0) as Prisma.Decimal.Value)),
        earnings: fmt(money((d?.earnings ?? 0) as Prisma.Decimal.Value)),
      };
    });

    const sumOf = (key: 'gmv' | 'commission' | 'earnings') => delivered.reduce((t, r) => t.plus(money(r[key] as Prisma.Decimal.Value)), money(0));
    const totalPlaced = [...placedBy.values()].reduce((a, b) => a + b, 0);
    const totalDelivered = delivered.reduce((a, r) => a + Number(r.n), 0);
    const closedCount = (status: string, day?: string) => closed.filter((r) => r.status === status && (!day || r.day === day)).reduce((a, r) => a + Number(r.n), 0);

    return {
      range: { from: range.from, to: range.to, days },
      today: {
        ordersPlaced: placedBy.get(today) ?? 0,
        ordersDelivered: series.at(-1)?.ordersDelivered ?? 0,
        ordersRejected: closedCount('REJECTED', today),
        ordersCancelled: closedCount('CANCELLED', today),
        sales: series.at(-1)?.sales ?? '0.00',
        earnings: series.at(-1)?.earnings ?? '0.00',
      },
      totals: {
        ordersPlaced: totalPlaced,
        ordersDelivered: totalDelivered,
        ordersCancelled: closedCount('CANCELLED'),
        ordersRejected: closedCount('REJECTED'),
        sales: fmt(sumOf('gmv')),
        commission: fmt(sumOf('commission')),
        earnings: fmt(sumOf('earnings')),
        averageOrderValue: totalDelivered > 0 ? fmt(sumOf('gmv').div(totalDelivered)) : '0.00',
        // Share of orders in the range the shop did not turn down.
        acceptanceRate: totalPlaced > 0 ? Number((((totalPlaced - closedCount('REJECTED')) / totalPlaced) * 100).toFixed(1)) : null,
      },
      inProgress: open.map((g) => ({ status: g.status, orders: g._count._all })),
      series,
      topServices: topServices.map((r) => ({ name: String(r.name), quantity: Number(r.qty), revenue: fmt(money(r.revenue as Prisma.Decimal.Value)) })),
      ratingTrend: ratings.map((r) => ({ weekStarting: String(r.week), average: money(r.avg as Prisma.Decimal.Value).toFixed(2), reviews: Number(r.n) })),
    };
  }
}
