import { Injectable } from '@nestjs/common';
import { LedgerType, Prisma } from '@prisma/client';
import { Money, ZERO, money, round2 } from '../../common/money/money';
import { PrismaService } from '../../infra/prisma/prisma.service';

type Db = Prisma.TransactionClient | PrismaService;

/** Open payout requests count against what a vendor can still ask for. */
export const RESERVING_PAYOUT_STATUSES = ['REQUESTED', 'APPROVED'] as const;

/**
 * The vendor ledger (TRD §13.2). Entries are signed (credit +, debit -) and never edited:
 *
 *   ORDER_EARNING  +(vendorEarning + commission)   what the order was worth to the vendor before commission
 *   COMMISSION     -commission                      our cut; the two together leave exactly `vendorEarning`
 *   REFUND         -vendorEarning                    the vendor's share taken back when a delivered order is refunded
 *   PAYOUT         -amount                           money sent to the vendor
 *   ADJUSTMENT     +/-                               a correction made by an admin, with a note
 *
 * A vendor's balance is the plain sum of their entries. Every posting is idempotent: the database refuses a second
 * earning, commission or refund for the same order, so a job that runs twice changes nothing.
 */
@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /** Credits the vendor for a delivered, paid-for order. Returns false if it was already posted. */
  async postEarnings(db: Db, orderId: string): Promise<boolean> {
    const o = await db.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { vendorId: true, orderNo: true, vendorEarning: true, commissionAmount: true, commissionRatePct: true },
    });
    const commission = round2(money(o.commissionAmount));
    const gross = round2(money(o.vendorEarning).plus(commission));
    const made = await db.ledgerEntry.createMany({
      data: [
        { vendorId: o.vendorId, orderId, type: LedgerType.ORDER_EARNING, amount: gross, note: `Order ${o.orderNo}` },
        { vendorId: o.vendorId, orderId, type: LedgerType.COMMISSION, amount: commission.negated(), note: `Commission ${money(o.commissionRatePct).toFixed(2)}% on order ${o.orderNo}` },
      ],
      skipDuplicates: true,
    });
    return made.count > 0;
  }

  /** Takes the vendor's share back, but only if it was ever credited. Returns false if there was nothing to take back. */
  async postRefund(db: Db, orderId: string): Promise<boolean> {
    const earned = await db.ledgerEntry.count({ where: { orderId, type: LedgerType.ORDER_EARNING } });
    if (earned === 0) return false;
    const o = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { vendorId: true, orderNo: true, vendorEarning: true } });
    const made = await db.ledgerEntry.createMany({
      data: [{ vendorId: o.vendorId, orderId, type: LedgerType.REFUND, amount: round2(money(o.vendorEarning)).negated(), note: `Refund of order ${o.orderNo}` }],
      skipDuplicates: true,
    });
    return made.count > 0;
  }

  /** Everything the vendor has earned minus everything taken or paid out. */
  async balance(db: Db, vendorId: string): Promise<Money> {
    const agg = await db.ledgerEntry.aggregate({ where: { vendorId }, _sum: { amount: true } });
    return round2(agg._sum.amount ? money(agg._sum.amount) : ZERO);
  }

  /** What the vendor may still ask to be paid: the balance minus payouts already requested or approved. */
  async available(db: Db, vendorId: string): Promise<Money> {
    const [balance, reserved] = await Promise.all([
      this.balance(db, vendorId),
      db.payout.aggregate({ where: { vendorId, status: { in: [...RESERVING_PAYOUT_STATUSES] } }, _sum: { amount: true } }),
    ]);
    return round2(balance.minus(reserved._sum.amount ? money(reserved._sum.amount) : ZERO));
  }
}
