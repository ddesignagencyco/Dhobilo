import { HttpStatus, Injectable } from '@nestjs/common';
import { PaymentMethod, PaymentStatus, Prisma, Role } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { Money, ZERO, fmt, money, round2, sum } from '../../common/money/money';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, beforeCursor, sliceWithCursor } from '../../common/pagination/cursor';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LedgerService } from './ledger.service';

type Db = Prisma.TransactionClient | PrismaService;

export interface SettleCodInput {
  riderId: string;
  /** What the rider handed over. Must equal the total of the collections being settled. */
  amount: string;
  /** Specific collections to settle. Omit to settle everything the rider currently owes. */
  collectionIds?: string[];
  reference?: string;
}

/**
 * Cash on delivery (SRS §8.2, TRD §13.2). The rider's cash for each delivered COD order becomes a `CodCollection`.
 * When an admin records the rider's deposit as a `CodSettlement`, the platform really holds the money, and only then
 * is the vendor credited (TRD §20 #6, our working rule): the order's earning and commission are posted to the
 * vendor ledger in the same transaction as the settlement.
 */
@Injectable()
export class CodService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
  ) {}

  /** The rider confirms they have the cash by completing the delivery. Idempotent per order. */
  async recordCollection(db: Db, orderId: string, riderId: string): Promise<boolean> {
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { paymentMethod: true, total: true } });
    if (order.paymentMethod !== PaymentMethod.COD) return false;
    const made = await db.codCollection.createMany({ data: [{ orderId, riderId, amount: order.total }], skipDuplicates: true });
    if (made.count === 0) return false;
    await db.payment.updateMany({ where: { orderId, gateway: 'cod', status: PaymentStatus.COD_PENDING }, data: { status: PaymentStatus.COD_COLLECTED } });
    await db.order.updateMany({ where: { id: orderId, paymentStatus: PaymentStatus.COD_PENDING }, data: { paymentStatus: PaymentStatus.COD_COLLECTED } });
    return true;
  }

  /** What one rider is holding and what they have handed in recently (the rider's cash screen). */
  async riderSummary(riderId: string) {
    const [open, settlements] = await Promise.all([
      this.prisma.codCollection.findMany({ where: { riderId, settlementId: null }, orderBy: { collectedAt: 'asc' }, take: 100, select: { id: true, amount: true, collectedAt: true, order: { select: { orderNo: true } } } }),
      this.prisma.codSettlement.findMany({ where: { riderId }, orderBy: { settledAt: 'desc' }, take: 10, select: { id: true, amount: true, reference: true, settledAt: true } }),
    ]);
    const total = await this.prisma.codCollection.aggregate({ where: { riderId, settlementId: null }, _sum: { amount: true }, _count: { _all: true } });
    return {
      currency: 'PKR' as const,
      outstanding: fmt(total._sum.amount ? money(total._sum.amount) : ZERO),
      outstandingCount: total._count._all,
      collections: open.map((c) => ({ id: c.id, orderNo: c.order.orderNo, amount: fmt(money(c.amount)), collectedAt: c.collectedAt })),
      recentSettlements: settlements.map((s) => ({ ...s, amount: fmt(money(s.amount)) })),
    };
  }

  /** Riders who owe cash, the biggest debts first (admin). */
  async ridersOwing() {
    const rows = await this.prisma.codCollection.groupBy({ by: ['riderId'], where: { settlementId: null }, _sum: { amount: true }, _count: { _all: true }, _min: { collectedAt: true } });
    const riders = await this.prisma.rider.findMany({ where: { id: { in: rows.map((r) => r.riderId) } }, select: { id: true, cityId: true, user: { select: { name: true, phone: true } } } });
    const byId = new Map(riders.map((r) => [r.id, r]));
    return rows
      .map((r) => ({
        riderId: r.riderId,
        name: byId.get(r.riderId)?.user.name ?? null,
        phone: byId.get(r.riderId)?.user.phone ?? null,
        cityId: byId.get(r.riderId)?.cityId ?? null,
        outstanding: fmt(r._sum.amount ? money(r._sum.amount) : ZERO),
        collections: r._count._all,
        oldestCollectedAt: r._min.collectedAt,
      }))
      .sort((a, b) => Number(b.outstanding) - Number(a.outstanding));
  }

  /** The unsettled collections of one rider, oldest first (admin picks from these when the rider hands in less than everything). */
  async riderCollections(riderId: string) {
    const rows = await this.prisma.codCollection.findMany({ where: { riderId, settlementId: null }, orderBy: { collectedAt: 'asc' }, take: 200, select: { id: true, amount: true, collectedAt: true, order: { select: { id: true, orderNo: true, vendor: { select: { businessName: true } } } } } });
    return rows.map((c) => ({ id: c.id, amount: fmt(money(c.amount)), collectedAt: c.collectedAt, order: { id: c.order.id, orderNo: c.order.orderNo, vendor: c.order.vendor.businessName } }));
  }

  /**
   * Records a rider's deposit. The amount must equal the collections being settled to the rupee: nothing is settled
   * by guesswork. Credits each order's vendor in the same transaction. Two admins settling the same collections at once
   * cannot both succeed.
   */
  async settle(adminId: string, input: SettleCodInput, requestId?: string) {
    const amount = this.parseAmount(input.amount);
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'cod:' + input.riderId})) `;
        const rider = await tx.rider.findUnique({ where: { id: input.riderId }, select: { id: true } });
        if (!rider) throw new AppException(ErrorCode.NOT_FOUND, 'Rider not found.', HttpStatus.NOT_FOUND);

        const collections = await tx.codCollection.findMany({
          where: { riderId: input.riderId, settlementId: null, ...(input.collectionIds?.length ? { id: { in: input.collectionIds } } : {}) },
          select: { id: true, orderId: true, amount: true },
        });
        if (input.collectionIds?.length && collections.length !== new Set(input.collectionIds).size) {
          throw new AppException('COD_COLLECTION_UNAVAILABLE', 'Some of those collections are unknown, belong to another rider, or are already settled.', HttpStatus.CONFLICT);
        }
        if (collections.length === 0) throw new AppException('COD_NOTHING_TO_SETTLE', 'This rider has no cash waiting to be settled.', HttpStatus.CONFLICT);

        const expected = round2(sum(collections.map((c) => money(c.amount))));
        if (!expected.equals(amount)) {
          throw new AppException('COD_AMOUNT_MISMATCH', 'The amount does not match the collections being settled.', HttpStatus.CONFLICT, { expected: fmt(expected), given: fmt(amount), collections: collections.length });
        }

        const settlement = await tx.codSettlement.create({ data: { riderId: input.riderId, amount, reference: input.reference, settledBy: adminId } });
        await tx.codCollection.updateMany({ where: { id: { in: collections.map((c) => c.id) }, settlementId: null }, data: { settlementId: settlement.id } });

        let credited = 0;
        for (const c of collections) {
          if (await this.ledger.postEarnings(tx, c.orderId)) credited++;
          // The platform now holds the cash: the order is fully paid.
          await tx.payment.updateMany({ where: { orderId: c.orderId, gateway: 'cod', status: PaymentStatus.COD_COLLECTED }, data: { status: PaymentStatus.PAID, paidAt: new Date() } });
          await tx.order.updateMany({ where: { id: c.orderId, paymentStatus: PaymentStatus.COD_COLLECTED }, data: { paymentStatus: PaymentStatus.PAID } });
        }
        await this.audit.record(
          { action: 'COD_SETTLED', entity: 'CodSettlement', entityId: settlement.id, actorId: adminId, actorRole: Role.ADMIN, after: { riderId: input.riderId, amount: fmt(amount), collections: collections.length, reference: input.reference ?? null }, requestId },
          tx,
        );
        return { id: settlement.id, riderId: input.riderId, amount: fmt(amount), reference: input.reference ?? null, settledAt: settlement.settledAt, collections: collections.length, vendorsCredited: credited };
      },
      { timeout: 30_000 },
    );
  }

  async settlements(riderId: string | undefined, cursor: string | undefined, limit = DEFAULT_PAGE_SIZE) {
    const take = Math.min(limit, MAX_PAGE_SIZE);
    const rows = await this.prisma.codSettlement.findMany({
      where: { ...(riderId ? { riderId } : {}), ...(cursor ? beforeSettled(cursor) : {}) },
      orderBy: [{ settledAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      select: { id: true, riderId: true, amount: true, reference: true, settledAt: true, settledBy: true, rider: { select: { user: { select: { name: true } } } }, _count: { select: { collections: true } } },
    });
    const { items, nextCursor } = sliceWithCursor(rows.map((r) => ({ ...r, createdAt: r.settledAt })), take);
    return { items: items.map(({ createdAt: _c, rider, _count, amount, ...r }) => ({ ...r, amount: fmt(money(amount)), riderName: rider.user.name, collections: _count.collections })), nextCursor };
  }

  private parseAmount(input: string): Money {
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(input) || money(input).lte(0)) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, 'amount must be a positive amount like 1250 or 1250.50.', HttpStatus.BAD_REQUEST);
    }
    return round2(money(input));
  }
}

/** Newest-first paging over (settledAt, id), using the same opaque cursor as everywhere else. */
function beforeSettled(cursor: string) {
  const f = beforeCursor(cursor) as { OR?: { createdAt?: unknown; id?: unknown }[] };
  const map = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k === 'createdAt' ? 'settledAt' : k, v]));
  return { OR: (f.OR ?? []).map(map) };
}
