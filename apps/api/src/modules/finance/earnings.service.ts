import { HttpStatus, Injectable } from '@nestjs/common';
import { LedgerType, OrderStatus, PaymentMethod, PayoutStatus } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { Money, ZERO, fmt, money, round2 } from '../../common/money/money';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, beforeCursor, sliceWithCursor } from '../../common/pagination/cursor';
import { Clock } from '../../common/time/clock';
import { addDays, dayOfWeekOf, localParts, localToUtc } from '../../common/time/zoned';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { EarningsLinesQueryDto } from './dto/finance.dto';
import { LedgerService, RESERVING_PAYOUT_STATUSES } from './ledger.service';

export type Period = 'day' | 'week' | 'month';

/** First and last day (inclusive, YYYY-MM-DD) of the day / Monday-to-Sunday week / calendar month containing `date`. */
export function periodRange(period: Period, date: string): { from: string; to: string } {
  if (period === 'day') return { from: date, to: date };
  if (period === 'week') {
    const from = addDays(date, -((dayOfWeekOf(date) + 6) % 7)); // back to Monday
    return { from, to: addDays(from, 6) };
  }
  const [y, m] = date.split('-').map(Number);
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  return { from: first, to: addDays(next, -1) };
}

/** What vendors see of their money (FR-V8): totals for a period, per-order lines, and the balance they can withdraw. */
@Injectable()
export class EarningsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly clock: Clock,
  ) {}

  private async timezone(vendorId: string): Promise<string> {
    const v = await this.prisma.vendor.findUnique({ where: { id: vendorId }, select: { city: { select: { timezone: true } } } });
    if (!v) throw new AppException(ErrorCode.NOT_FOUND, 'Vendor not found.', HttpStatus.NOT_FOUND);
    return v.city.timezone;
  }

  /** Earned, commission taken, refunds and adjustments, and the net, for a day, week or month; plus a row per day. */
  async summary(vendorId: string, period: Period, date?: string) {
    const tz = await this.timezone(vendorId);
    const today = localParts(this.clock.now(), tz).date;
    const { from, to } = periodRange(period, date ?? today);
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { vendorId, type: { in: [LedgerType.ORDER_EARNING, LedgerType.COMMISSION, LedgerType.REFUND, LedgerType.ADJUSTMENT] }, createdAt: { gte: localToUtc(from, 0, tz), lt: localToUtc(addDays(to, 1), 0, tz) } },
      select: { type: true, amount: true, createdAt: true },
    });

    const empty = () => ({ gross: ZERO, commission: ZERO, refunds: ZERO, adjustments: ZERO, orders: 0 });
    const days = new Map<string, ReturnType<typeof empty>>();
    for (let d = from; d <= to; d = addDays(d, 1)) days.set(d, empty());
    const total = empty();
    for (const e of entries) {
      const bucket = days.get(localParts(e.createdAt, tz).date);
      for (const t of bucket ? [bucket, total] : [total]) {
        const a = money(e.amount);
        if (e.type === LedgerType.ORDER_EARNING) {
          t.gross = t.gross.plus(a);
          t.orders++;
        } else if (e.type === LedgerType.COMMISSION) t.commission = t.commission.plus(a.negated());
        else if (e.type === LedgerType.REFUND) t.refunds = t.refunds.plus(a.negated());
        else t.adjustments = t.adjustments.plus(a);
      }
    }
    const shape = (t: ReturnType<typeof empty>) => ({
      gross: fmt(t.gross),
      commission: fmt(t.commission),
      refunds: fmt(t.refunds),
      adjustments: fmt(t.adjustments),
      net: fmt(t.gross.minus(t.commission).minus(t.refunds).plus(t.adjustments)),
      orders: t.orders,
    });
    return { period, from, to, currency: 'PKR' as const, ...shape(total), days: [...days.entries()].map(([date, t]) => ({ date, ...shape(t) })) };
  }

  /** One line per order that earned money in the range, newest first. */
  async lines(vendorId: string, q: EarningsLinesQueryDto) {
    const tz = await this.timezone(vendorId);
    const today = localParts(this.clock.now(), tz).date;
    const to = q.to ?? today;
    const from = q.from ?? addDays(to, -29);
    if (from > to) throw new AppException('INVALID_RANGE', '`from` must not be after `to`.', HttpStatus.BAD_REQUEST);
    const limit = Math.min(q.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    const rows = await this.prisma.ledgerEntry.findMany({
      where: { vendorId, type: LedgerType.ORDER_EARNING, createdAt: { gte: localToUtc(from, 0, tz), lt: localToUtc(addDays(to, 1), 0, tz) }, ...beforeCursor(q.cursor) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        createdAt: true,
        amount: true,
        order: { select: { id: true, orderNo: true, deliveredAt: true, paymentMethod: true, commissionRatePct: true, commissionAmount: true, vendorEarning: true, ledger: { where: { type: LedgerType.REFUND }, select: { id: true } } } },
      },
    });
    const { items, nextCursor } = sliceWithCursor(rows, limit);
    return {
      items: items.map((r) => ({
        orderId: r.order!.id,
        orderNo: r.order!.orderNo,
        earnedAt: r.createdAt,
        deliveredAt: r.order!.deliveredAt,
        paymentMethod: r.order!.paymentMethod,
        gross: fmt(money(r.amount)),
        commissionRatePct: fmt(money(r.order!.commissionRatePct)),
        commission: fmt(money(r.order!.commissionAmount)),
        net: fmt(money(r.order!.vendorEarning)),
        refunded: r.order!.ledger.length > 0,
      })),
      nextCursor,
    };
  }

  /** The balance, what can be withdrawn now, what is tied up in open requests, what was paid, and cash orders still waiting on the rider. */
  async balance(vendorId: string) {
    const [balance, available, reserved, paid, pendingCod] = await Promise.all([
      this.ledger.balance(this.prisma, vendorId),
      this.ledger.available(this.prisma, vendorId),
      this.prisma.payout.aggregate({ where: { vendorId, status: { in: [...RESERVING_PAYOUT_STATUSES] } }, _sum: { amount: true } }),
      this.prisma.payout.aggregate({ where: { vendorId, status: PayoutStatus.PAID }, _sum: { amount: true } }),
      this.prisma.order.aggregate({
        where: { vendorId, paymentMethod: PaymentMethod.COD, status: OrderStatus.DELIVERED, ledger: { none: { type: LedgerType.ORDER_EARNING } } },
        _sum: { vendorEarning: true },
        _count: { _all: true },
      }),
    ]);
    const m = (v: { _sum: { amount: unknown } }): Money => (v._sum.amount ? money(v._sum.amount as string) : ZERO);
    return {
      currency: 'PKR' as const,
      balance: fmt(balance),
      available: fmt(available),
      reservedForPayouts: fmt(round2(m(reserved))),
      paidOut: fmt(round2(m(paid))),
      pendingCod: fmt(pendingCod._sum.vendorEarning ? money(pendingCod._sum.vendorEarning) : ZERO),
      pendingCodOrders: pendingCod._count._all,
    };
  }

  /** Plain list of a vendor's ledger entries, newest first (admin support). */
  async ledgerPage(vendorId: string, cursor: string | undefined, limit = DEFAULT_PAGE_SIZE) {
    const take = Math.min(limit, MAX_PAGE_SIZE);
    const rows = await this.prisma.ledgerEntry.findMany({
      where: { vendorId, ...beforeCursor(cursor) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      select: { id: true, type: true, amount: true, note: true, orderId: true, payoutId: true, createdAt: true },
    });
    const { items, nextCursor } = sliceWithCursor(rows, take);
    return { items: items.map((e) => ({ ...e, amount: fmt(money(e.amount)) })), nextCursor };
  }

  /** Sums used by reconciliation checks. */
  async totals(vendorId: string) {
    const rows = await this.prisma.ledgerEntry.groupBy({ by: ['type'], where: { vendorId }, _sum: { amount: true } });
    return Object.fromEntries(rows.map((r) => [r.type, fmt(r._sum.amount ? money(r._sum.amount) : ZERO)])) as Partial<Record<LedgerType, string>>;
  }
}

