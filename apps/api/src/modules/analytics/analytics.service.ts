import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ZERO, fmt, money, sum } from '../../common/money/money';
import { Clock } from '../../common/time/clock';
import { DayRange, resolveDayRange } from '../../common/time/date-range';
import { localParts } from '../../common/time/zoned';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AnalyticsQueryDto, TopVendorsQueryDto } from './analytics.dto';
import { CityDay, DayStatsService, VendorDay } from './day-stats.service';

const TZ = 'Asia/Karachi';
const MAX_DAYS = 366;

const asDate = (day: string) => new Date(`${day}T00:00:00.000Z`);
const asDay = (d: Date) => d.toISOString().slice(0, 10);

export type CityDayRow = CityDay & { day: string };
export type VendorDayRow = VendorDay & { day: string };

type Money = Prisma.Decimal;

interface Totals {
  ordersPlaced: number;
  ordersDelivered: number;
  ordersCancelled: number;
  gmv: Money;
  commission: Money;
  vendorEarnings: Money;
  deliveryFees: Money;
  discounts: Money;
  codGmv: Money;
}

const emptyTotals = (): Totals => ({
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

function addInto(t: Totals, r: Totals): Totals {
  t.ordersPlaced += r.ordersPlaced;
  t.ordersDelivered += r.ordersDelivered;
  t.ordersCancelled += r.ordersCancelled;
  t.gmv = sum([t.gmv, r.gmv]);
  t.commission = sum([t.commission, r.commission]);
  t.vendorEarnings = sum([t.vendorEarnings, r.vendorEarnings]);
  t.deliveryFees = sum([t.deliveryFees, r.deliveryFees]);
  t.discounts = sum([t.discounts, r.discounts]);
  t.codGmv = sum([t.codGmv, r.codGmv]);
  return t;
}

const shown = (t: Totals) => ({
  ordersPlaced: t.ordersPlaced,
  ordersDelivered: t.ordersDelivered,
  ordersCancelled: t.ordersCancelled,
  gmv: fmt(t.gmv),
  revenue: fmt(t.commission),
  vendorEarnings: fmt(t.vendorEarnings),
  deliveryFees: fmt(t.deliveryFees),
  discounts: fmt(t.discounts),
  averageOrderValue: t.ordersDelivered > 0 ? fmt(t.gmv.div(t.ordersDelivered)) : '0.00',
});

/**
 * Platform analytics for admins (FR-A4). Finished days come from the nightly rollup tables (missing days are
 * rolled up on demand, so a dashboard is never wrong, only briefly slower); today is always computed live.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly stats: DayStatsService,
  ) {}

  today(): string {
    return localParts(this.clock.now(), TZ).date;
  }

  range(q: { from?: string; to?: string }, defaultDays = 7): DayRange {
    return resolveDayRange(q, this.today(), { defaultDays, maxDays: MAX_DAYS });
  }

  /** Recomputes one day and replaces its stored rows. Safe to repeat: the result only depends on the orders. */
  async rollupDay(day: string): Promise<{ day: string; cities: number; vendors: number }> {
    const { cities, vendors } = await this.stats.compute(day);
    const allCities = await this.prisma.city.findMany({ select: { id: true } });
    const byCity = new Map(cities.map((c) => [c.cityId, c]));
    const date = asDate(day);
    // Every city gets a row (zeros if it had no orders): that is how a finished, empty day is told from a day not yet rolled up.
    const cityRows = allCities.map(({ id }) => {
      const c = byCity.get(id);
      return {
        day: date,
        cityId: id,
        ordersPlaced: c?.ordersPlaced ?? 0,
        ordersDelivered: c?.ordersDelivered ?? 0,
        ordersCancelled: c?.ordersCancelled ?? 0,
        gmv: c?.gmv ?? ZERO,
        commission: c?.commission ?? ZERO,
        vendorEarnings: c?.vendorEarnings ?? ZERO,
        deliveryFees: c?.deliveryFees ?? ZERO,
        discounts: c?.discounts ?? ZERO,
        codGmv: c?.codGmv ?? ZERO,
        activeCustomers: c?.activeCustomers ?? 0,
        newCustomers: c?.newCustomers ?? 0,
      };
    });
    await this.prisma.$transaction([
      this.prisma.dailyCityStat.deleteMany({ where: { day: date } }),
      this.prisma.dailyVendorStat.deleteMany({ where: { day: date } }),
      this.prisma.dailyCityStat.createMany({ data: cityRows }),
      this.prisma.dailyVendorStat.createMany({
        data: vendors.map((v) => ({
          day: date,
          vendorId: v.vendorId,
          cityId: v.cityId,
          ordersPlaced: v.ordersPlaced,
          ordersDelivered: v.ordersDelivered,
          ordersCancelled: v.ordersCancelled,
          gmv: v.gmv,
          commission: v.commission,
          vendorEarnings: v.vendorEarnings,
        })),
      }),
    ]);
    return { day, cities: cityRows.length, vendors: vendors.length };
  }

  /** Rolls up every finished day in `days` that has no stored rows yet. */
  private async ensureRolled(days: string[]): Promise<void> {
    const finished = days.filter((d) => d < this.today());
    if (finished.length === 0) return;
    const have = await this.prisma.dailyCityStat.findMany({
      where: { day: { in: finished.map(asDate) } },
      distinct: ['day'],
      select: { day: true },
    });
    const stored = new Set(have.map((r) => asDay(r.day)));
    for (const day of finished) if (!stored.has(day)) await this.rollupDay(day);
  }

  /** One row per day and city across the range. */
  async cityRows(range: DayRange, cityId?: number): Promise<CityDayRow[]> {
    await this.ensureRolled(range.days);
    const today = this.today();
    const finished = range.days.filter((d) => d < today);
    const stored = await this.prisma.dailyCityStat.findMany({
      where: { day: { in: finished.map(asDate) }, ...(cityId ? { cityId } : {}) },
    });
    const rows: CityDayRow[] = stored.map((r) => ({ ...r, day: asDay(r.day) }));
    if (range.days.includes(today)) {
      const live = await this.stats.compute(today);
      for (const c of live.cities) if (!cityId || c.cityId === cityId) rows.push({ ...c, day: today });
    }
    return rows;
  }

  async vendorRows(range: DayRange, cityId?: number): Promise<VendorDayRow[]> {
    await this.ensureRolled(range.days);
    const today = this.today();
    const finished = range.days.filter((d) => d < today);
    const stored = await this.prisma.dailyVendorStat.findMany({
      where: { day: { in: finished.map(asDate) }, ...(cityId ? { cityId } : {}) },
    });
    const rows: VendorDayRow[] = stored.map((r) => ({
      ...r,
      day: asDay(r.day),
      deliveryFees: ZERO,
      discounts: ZERO,
      codGmv: ZERO,
    }));
    if (range.days.includes(today)) {
      const live = await this.stats.compute(today);
      for (const v of live.vendors) if (!cityId || v.cityId === cityId) rows.push({ ...v, day: today });
    }
    return rows;
  }

  /** Customers who placed at least one order in the range (distinct across days, so it cannot come from daily sums). */
  private async activeCustomers(range: DayRange, cityId?: number): Promise<number> {
    const rows = await this.prisma.order.findMany({
      where: { createdAt: { gte: range.start, lt: range.end }, ...(cityId ? { cityId } : {}) },
      distinct: ['customerId'],
      select: { customerId: true },
    });
    return rows.length;
  }

  private series(range: DayRange, rows: CityDayRow[]) {
    const byDay = new Map<string, Totals>();
    for (const r of rows) byDay.set(r.day, addInto(byDay.get(r.day) ?? emptyTotals(), r));
    return range.days.map((day) => ({ day, ...shown(byDay.get(day) ?? emptyTotals()) }));
  }

  private header(range: DayRange, cityId?: number) {
    return { from: range.from, to: range.to, cityId: cityId ?? null };
  }

  async overview(q: AnalyticsQueryDto) {
    const range = this.range(q);
    const rows = await this.cityRows(range, q.cityId);
    const totals = rows.reduce((t, r) => addInto(t, r), emptyTotals());
    const [activeCustomers, newCustomers] = [await this.activeCustomers(range, q.cityId), rows.reduce((n, r) => n + r.newCustomers, 0)];
    const vendors = await this.prisma.vendor.count({ where: { status: 'APPROVED', ...(q.cityId ? { cityId: q.cityId } : {}) } });
    return {
      range: this.header(range, q.cityId),
      totals: { ...shown(totals), activeCustomers, newCustomers, approvedVendors: vendors },
      series: this.series(range, rows),
    };
  }

  async orders(q: AnalyticsQueryDto) {
    const range = this.range(q);
    const rows = await this.cityRows(range, q.cityId);
    const where: Prisma.OrderWhereInput = { createdAt: { gte: range.start, lt: range.end }, ...(q.cityId ? { cityId: q.cityId } : {}) };
    const [byStatus, byPayment, cities] = await Promise.all([
      this.prisma.order.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.order.groupBy({ by: ['paymentMethod'], where, _count: { _all: true } }),
      this.prisma.city.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    const totals = rows.reduce((t, r) => addInto(t, r), emptyTotals());
    const cityName = new Map(cities.map((c) => [c.id, c.name]));
    const perCity = new Map<number, Totals>();
    for (const r of rows) perCity.set(r.cityId, addInto(perCity.get(r.cityId) ?? emptyTotals(), r));
    return {
      range: this.header(range, q.cityId),
      totals: { ordersPlaced: totals.ordersPlaced, ordersDelivered: totals.ordersDelivered, ordersCancelled: totals.ordersCancelled },
      // Where the orders placed in this range stand right now.
      byStatus: byStatus.map((g) => ({ status: g.status, orders: g._count._all })).sort((a, b) => b.orders - a.orders),
      byPaymentMethod: byPayment.map((g) => ({ method: g.paymentMethod, orders: g._count._all })).sort((a, b) => b.orders - a.orders),
      byCity: [...perCity.entries()]
        .map(([id, t]) => ({ cityId: id, city: cityName.get(id) ?? null, ordersPlaced: t.ordersPlaced, ordersDelivered: t.ordersDelivered, ordersCancelled: t.ordersCancelled }))
        .sort((a, b) => b.ordersPlaced - a.ordersPlaced),
      series: this.series(range, rows).map((s) => ({ day: s.day, ordersPlaced: s.ordersPlaced, ordersDelivered: s.ordersDelivered, ordersCancelled: s.ordersCancelled })),
    };
  }

  async revenue(q: AnalyticsQueryDto) {
    const range = this.range(q);
    const rows = await this.cityRows(range, q.cityId);
    const cities = await this.prisma.city.findMany({ select: { id: true, name: true } });
    const cityName = new Map(cities.map((c) => [c.id, c.name]));
    const totals = rows.reduce((t, r) => addInto(t, r), emptyTotals());
    const perCity = new Map<number, Totals>();
    for (const r of rows) perCity.set(r.cityId, addInto(perCity.get(r.cityId) ?? emptyTotals(), r));
    return {
      range: this.header(range, q.cityId),
      totals: {
        ...shown(totals),
        // Cash orders carry no platform money until the rider's deposit is recorded.
        cashGmv: fmt(totals.codGmv),
        prepaidGmv: fmt(totals.gmv.minus(totals.codGmv)),
      },
      byCity: [...perCity.entries()]
        .map(([id, t]) => ({ cityId: id, city: cityName.get(id) ?? null, ...shown(t) }))
        .sort((a, b) => Number(b.gmv) - Number(a.gmv)),
      series: this.series(range, rows).map((s) => ({ day: s.day, gmv: s.gmv, revenue: s.revenue, vendorEarnings: s.vendorEarnings, deliveryFees: s.deliveryFees, discounts: s.discounts })),
    };
  }

  async topVendors(q: TopVendorsQueryDto) {
    const range = this.range(q);
    const rows = await this.vendorRows(range, q.cityId);
    const per = new Map<string, Totals>();
    for (const r of rows) per.set(r.vendorId, addInto(per.get(r.vendorId) ?? emptyTotals(), r));
    const ranked = [...per.entries()]
      .filter(([, t]) => t.ordersDelivered > 0)
      .sort(([, a], [, b]) => b.gmv.comparedTo(a.gmv) || b.ordersDelivered - a.ordersDelivered)
      .slice(0, q.limit ?? 10);
    const vendors = await this.prisma.vendor.findMany({
      where: { id: { in: ranked.map(([id]) => id) } },
      select: { id: true, businessName: true, cityId: true, ratingAvg: true, ratingCount: true, city: { select: { name: true } } },
    });
    const info = new Map(vendors.map((v) => [v.id, v]));
    return {
      range: this.header(range, q.cityId),
      vendors: ranked.map(([id, t], i) => {
        const v = info.get(id);
        return {
          rank: i + 1,
          vendorId: id,
          businessName: v?.businessName ?? null,
          cityId: v?.cityId ?? null,
          city: v?.city.name ?? null,
          ordersDelivered: t.ordersDelivered,
          gmv: fmt(t.gmv),
          revenue: fmt(t.commission),
          vendorEarnings: fmt(t.vendorEarnings),
          ratingAvg: v ? money(v.ratingAvg).toFixed(2) : null,
          ratingCount: v?.ratingCount ?? 0,
        };
      }),
    };
  }
}
