import { Injectable } from '@nestjs/common';
import { LedgerType, OrderStatus, PayoutStatus, Prisma } from '@prisma/client';
import { Money, money, sum } from '../../common/money/money';
import { PrismaService } from '../../infra/prisma/prisma.service';

const PAID_OUT = [PayoutStatus.REQUESTED, PayoutStatus.APPROVED];

/**
 * Ledger entries that move the vendor's money. COMMISSION rows are a memo of what the platform kept: the vendor's
 * earning (`vendorEarning`) is already net of commission, so counting both would take the commission out twice.
 * Order value = ORDER_EARNING + COMMISSION; the vendor's balance = ORDER_EARNING + REFUND + PAYOUT + ADJUSTMENT.
 */
const MEMO_TYPES = [LedgerType.COMMISSION];

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Posts the vendor's earning and the platform commission for a delivered order. Safe to call more than once:
   * the advisory lock plus the existence check make it a no-op after the first successful post.
   */
  async postOrderEarnings(orderId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, `ledger:order:${orderId}`);
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { vendorId: true, status: true, commissionAmount: true, vendorEarning: true },
      });
      if (!order || order.status !== OrderStatus.DELIVERED) return false;
      const existing = await tx.ledgerEntry.count({ where: { orderId, type: { in: [LedgerType.ORDER_EARNING, LedgerType.COMMISSION] } } });
      if (existing > 0) return false;

      await tx.ledgerEntry.create({
        data: { vendorId: order.vendorId, orderId, type: LedgerType.ORDER_EARNING, amount: order.vendorEarning, note: 'Order earning' },
      });
      if (money(order.commissionAmount).gt(0)) {
        await tx.ledgerEntry.create({
          data: { vendorId: order.vendorId, orderId, type: LedgerType.COMMISSION, amount: money(order.commissionAmount).neg(), note: 'Platform commission' },
        });
      }
      return true;
    });
  }

  /** Takes back the vendor's earning for a delivered order that is refunded (the commission memo row is not part of it). */
  async refundOrderEarnings(orderId: string, note = 'Order refunded'): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, `ledger:refund:${orderId}`);
      const existing = await tx.ledgerEntry.findFirst({ where: { orderId, type: LedgerType.REFUND }, select: { id: true } });
      if (existing) return false;
      const entries = await tx.ledgerEntry.findMany({
        where: { orderId, type: { in: [LedgerType.ORDER_EARNING, LedgerType.COMMISSION] } },
        select: { vendorId: true, type: true, amount: true },
      });
      const earning = entries.find((e) => e.type === LedgerType.ORDER_EARNING);
      if (!entries.length || !earning) return false;
      const net = money(earning.amount);
      if (net.isZero()) return false;
      await tx.ledgerEntry.create({
        data: { vendorId: earning.vendorId, orderId, type: LedgerType.REFUND, amount: net.neg(), note },
      });
      return true;
    });
  }

  /** Records a paid-out amount against the vendor's balance. Idempotent per payout. */
  async postPayout(payoutId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, `ledger:payout:${payoutId}`);
      const existing = await tx.ledgerEntry.findFirst({ where: { payoutId }, select: { id: true } });
      if (existing) return false;
      const payout = await tx.payout.findUnique({ where: { id: payoutId }, select: { vendorId: true, amount: true } });
      if (!payout) return false;
      await tx.ledgerEntry.create({
        data: { vendorId: payout.vendorId, payoutId, type: LedgerType.PAYOUT, amount: payout.amount.neg(), note: 'Payout' },
      });
      return true;
    });
  }

  /** What the vendor is owed (signed ledger total without memo rows), payouts waiting to be paid, and what they can still ask for. */
  async balance(vendorId: string, db: Prisma.TransactionClient | PrismaService = this.prisma): Promise<{ total: Money; pending: Money; available: Money }> {
    const [entries, payouts] = await Promise.all([
      db.ledgerEntry.findMany({ where: { vendorId, type: { notIn: MEMO_TYPES } }, select: { amount: true } }),
      db.payout.findMany({ where: { vendorId, status: { in: PAID_OUT } }, select: { amount: true } }),
    ]);
    const total = sum(entries.map((e) => money(e.amount)));
    const pending = sum(payouts.map((p) => money(p.amount)));
    return { total, pending, available: total.minus(pending) };
  }

  list(vendorId: string, take = 100) {
    return this.prisma.ledgerEntry.findMany({
      where: { vendorId },
      orderBy: { createdAt: 'desc' },
      take,
      select: { id: true, orderId: true, payoutId: true, type: true, amount: true, note: true, createdAt: true },
    });
  }

  private lock(tx: Prisma.TransactionClient, key: string): Promise<number> {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }
}
