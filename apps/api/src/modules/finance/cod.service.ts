import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { JobStatus, JobType, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { fmt, money } from '../../common/money/money';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor';
import { Clock } from '../../common/time/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CodBalancesQueryDto, CodCollectionsQueryDto, SettleCodDto } from './dto/finance.dto';
import { LedgerService } from './ledger.service';

@Injectable()
export class CodService {
  private readonly logger = new Logger(CodService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly ledger: LedgerService,
  ) {}

  /**
   * Called when a COD order is delivered. The cash belongs to the rider who completed the drop leg; an
   * order handed to a courier partner has no rider to reconcile here, so it is left for ops.
   */
  async recordForOrder(orderId: string): Promise<boolean> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        paymentMethod: true,
        paymentStatus: true,
        total: true,
        jobs: {
          where: { jobType: JobType.DROP, status: JobStatus.COMPLETED },
          select: { riderId: true },
          take: 1,
        },
      },
    });
    if (!order || order.paymentMethod !== PaymentMethod.COD) return false;
    if (order.paymentStatus !== PaymentStatus.COD_PENDING) return false;
    const riderId = order.jobs[0]?.riderId;
    if (!riderId) {
      this.logger.warn({ orderId }, 'COD order delivered without a rider drop job; left for ops');
      return false;
    }

    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, `cod:order:${orderId}`);
      const existing = await tx.codCollection.findUnique({ where: { orderId }, select: { id: true } });
      if (existing) return false;
      await tx.codCollection.create({
        data: { orderId, riderId, amount: order.total, collectedAt: this.clock.now() },
      });
      await tx.order.update({ where: { id: orderId }, data: { paymentStatus: PaymentStatus.COD_COLLECTED } });
      await tx.payment.updateMany({
        where: { orderId, method: PaymentMethod.COD, status: PaymentStatus.COD_PENDING },
        data: { status: PaymentStatus.COD_COLLECTED },
      });
      return true;
    });
  }

  /** Riders with cash still in hand (collections not yet settled), largest first. */
  async balances(q: CodBalancesQueryDto) {
    const groups = await this.prisma.codCollection.groupBy({
      by: ['riderId'],
      where: { settlementId: null },
      _sum: { amount: true },
      _count: { _all: true },
    });
    if (groups.length === 0) return [];
    const riders = await this.prisma.rider.findMany({
      where: { id: { in: groups.map((g) => g.riderId) } },
      select: { id: true, user: { select: { name: true, phone: true } } },
    });
    const byId = new Map(riders.map((r) => [r.id, r]));
    const needle = q.q?.toLowerCase();
    return groups
      .map((g) => {
        const rider = byId.get(g.riderId);
        return {
          riderId: g.riderId,
          name: rider?.user.name ?? null,
          phone: rider?.user.phone ?? null,
          orders: g._count._all,
          amount: fmt(money(g._sum.amount ?? 0)),
        };
      })
      .filter((r) => !needle || r.name?.toLowerCase().includes(needle) || r.phone?.includes(needle))
      .sort((a, b) => money(b.amount).cmp(money(a.amount)));
  }

  async collections(q: CodCollectionsQueryDto) {
    const limit = q.limit ?? 50;
    const cursor = q.cursor ? decodeCursor(q.cursor) : null;
    const rows = await this.prisma.codCollection.findMany({
      where: {
        ...(q.riderId ? { riderId: q.riderId } : {}),
        ...(q.settled === true ? { settlementId: { not: null } } : q.settled === false ? { settlementId: null } : {}),
        ...(cursor ? { OR: [{ collectedAt: { lt: cursor.createdAt } }, { collectedAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}),
      },
      orderBy: [{ collectedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        order: { select: { orderNo: true } },
        rider: { select: { user: { select: { name: true, phone: true } } } },
      },
    });
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((c) => ({
      id: c.id,
      orderId: c.orderId,
      orderNo: c.order.orderNo,
      riderId: c.riderId,
      riderName: c.rider.user.name,
      riderPhone: c.rider.user.phone,
      amount: fmt(money(c.amount)),
      collectedAt: c.collectedAt,
      settlementId: c.settlementId,
    }));
    const last = rows[limit - 1];
    return { items, nextCursor: hasMore && last ? encodeCursor({ createdAt: last.collectedAt, id: last.id }) : null };
  }

  /**
   * Settles every unsettled collection for one rider in a single batch. The platform now holds that cash, so in the same
   * transaction each order's vendor is credited (earning and commission posted) and the order becomes fully PAID.
   */
  async settle(dto: SettleCodDto, adminId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, `cod:rider:${dto.riderId}`);
      const open = await tx.codCollection.findMany({
        where: { riderId: dto.riderId, settlementId: null },
        select: { id: true, orderId: true, amount: true },
      });
      if (open.length === 0) {
        throw new AppException('COD_NOTHING_TO_SETTLE', 'This rider has no unsettled cash.', HttpStatus.CONFLICT);
      }
      const amount = open.reduce((acc, c) => acc.plus(c.amount), money(0));
      const settlement = await tx.codSettlement.create({
        data: { riderId: dto.riderId, amount, reference: dto.reference, settledAt: this.clock.now(), settledBy: adminId },
      });
      await tx.codCollection.updateMany({
        where: { id: { in: open.map((c) => c.id) } },
        data: { settlementId: settlement.id },
      });
      let ordersCredited = 0;
      for (const c of open) {
        if (await this.ledger.postOrderEarnings(c.orderId, { cashDeposited: true }, tx)) ordersCredited++;
        await tx.order.updateMany({ where: { id: c.orderId, paymentStatus: PaymentStatus.COD_COLLECTED }, data: { paymentStatus: PaymentStatus.PAID } });
        await tx.payment.updateMany({ where: { orderId: c.orderId, method: PaymentMethod.COD, status: PaymentStatus.COD_COLLECTED }, data: { status: PaymentStatus.PAID } });
      }
      return {
        id: settlement.id,
        riderId: settlement.riderId,
        amount: fmt(money(settlement.amount)),
        collections: open.length,
        ordersCredited,
        reference: settlement.reference,
        settledAt: settlement.settledAt,
      };
    });
  }

  async riderSummary(riderId: string) {
    const collections = await this.prisma.codCollection.findMany({
      where: { riderId },
      orderBy: [{ collectedAt: 'desc' }, { id: 'desc' }],
      take: 50,
      select: { id: true, orderId: true, amount: true, collectedAt: true, settlementId: true, order: { select: { orderNo: true } } },
    });
    const unsettled = collections.filter((c) => !c.settlementId);
    return {
      cashInHand: fmt(unsettled.reduce((acc, c) => acc.plus(c.amount), money(0))),
      unsettledOrders: unsettled.length,
      collections: collections.map((c) => ({
        id: c.id,
        orderId: c.orderId,
        orderNo: c.order.orderNo,
        amount: fmt(money(c.amount)),
        collectedAt: c.collectedAt,
        settled: Boolean(c.settlementId),
        settlementId: c.settlementId,
      })),
    };
  }

  private lock(tx: Prisma.TransactionClient, key: string): Promise<number> {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }
}
