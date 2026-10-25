import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { fmt, money, sum } from '../../common/money/money';
import { Clock } from '../../common/time/clock';
import { addDays, localParts, localToUtc } from '../../common/time/zoned';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { EarningsQueryDto } from './dto/finance.dto';
import { LedgerService } from './ledger.service';

const TZ = 'Asia/Karachi';

@Injectable()
export class EarningsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly clock: Clock,
  ) {}

  async vendorSummary(vendorId: string, q: EarningsQueryDto) {
    const now = this.clock.now();
    const today = localParts(now, TZ).date;
    const range = q.range ?? 'week';
    const startDate = range === 'day' ? today : range === 'week' ? addDays(today, -6) : `${today.slice(0, 8)}01`;
    const from = localToUtc(startDate, 0, TZ);

    const [orders, balance] = await Promise.all([
      this.prisma.order.findMany({
        where: { vendorId, status: OrderStatus.DELIVERED, deliveredAt: { gte: from, lte: now } },
        orderBy: { deliveredAt: 'desc' },
        select: {
          id: true,
          orderNo: true,
          deliveredAt: true,
          subtotal: true,
          discountTotal: true,
          commissionRatePct: true,
          commissionAmount: true,
          vendorEarning: true,
        },
      }),
      this.ledger.balance(vendorId),
    ]);

    const subtotal = sum(orders.map((o) => money(o.subtotal)));
    const discount = sum(orders.map((o) => money(o.discountTotal)));
    const commission = sum(orders.map((o) => money(o.commissionAmount)));
    const net = sum(orders.map((o) => money(o.vendorEarning)));
    return {
      range,
      from: from.toISOString(),
      to: now.toISOString(),
      totals: {
        orders: orders.length,
        gross: fmt(subtotal.minus(discount)),
        commission: fmt(commission),
        net: fmt(net),
      },
      balance: { total: fmt(balance.total), pending: fmt(balance.pending), available: fmt(balance.available) },
      orders: orders.map((o) => ({
        id: o.id,
        orderNo: o.orderNo,
        deliveredAt: o.deliveredAt?.toISOString() ?? null,
        subtotal: fmt(money(o.subtotal)),
        discount: fmt(money(o.discountTotal)),
        commissionRatePct: fmt(money(o.commissionRatePct)),
        commission: fmt(money(o.commissionAmount)),
        net: fmt(money(o.vendorEarning)),
      })),
    };
  }
}
