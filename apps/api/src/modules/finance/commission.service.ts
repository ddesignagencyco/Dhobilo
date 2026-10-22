import { HttpStatus, Injectable } from '@nestjs/common';
import { CommissionScope, Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { Money, ZERO, round2, sum } from '../../common/money/money';
import { PrismaService } from '../../infra/prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

export interface RuleRow {
  scope: CommissionScope;
  vendorId: string | null;
  categoryId: number | null;
  ratePct: Prisma.Decimal;
  effectiveFrom: Date;
}

export interface CommissionLine {
  categoryId: number;
  lineTotal: Money;
}

export interface CommissionResult {
  /** Effective rate over the whole order (blended when categories differ), 2 decimals. */
  ratePct: Money;
  amount: Money;
  /** What the vendor keeps: subtotal - discount - commission (the delivery fee never belongs to the vendor). */
  vendorEarning: Money;
}

/** Latest rule (effectiveFrom <= at) among those matching `pick`. */
const latest = (rules: RuleRow[], at: Date, pick: (r: RuleRow) => boolean) =>
  rules
    .filter((r) => r.effectiveFrom <= at && pick(r))
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0];

/**
 * Commission resolution (ERD §7): VENDOR rule > CATEGORY rule > GLOBAL rule; within a scope the rule with the
 * latest effectiveFrom that has already started wins. Returns null when no rule applies at all.
 */
export function resolveRate(rules: RuleRow[], vendorId: string, categoryId: number, at: Date): Prisma.Decimal | null {
  const rule =
    latest(rules, at, (r) => r.scope === 'VENDOR' && r.vendorId === vendorId) ??
    latest(rules, at, (r) => r.scope === 'CATEGORY' && r.categoryId === categoryId) ??
    latest(rules, at, (r) => r.scope === 'GLOBAL');
  return rule ? rule.ratePct : null;
}

@Injectable()
export class CommissionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Commission for an order, fixed at placement time (ERD §7). Each line uses its own resolved rate; a discount
   * reduces every line's commission proportionally.
   */
  async compute(db: Db, vendorId: string, lines: CommissionLine[], discount: Money, at: Date): Promise<CommissionResult> {
    const categoryIds = [...new Set(lines.map((l) => l.categoryId))];
    const rules = await db.commissionRule.findMany({
      where: {
        effectiveFrom: { lte: at },
        OR: [{ scope: 'GLOBAL' }, { scope: 'VENDOR', vendorId }, { scope: 'CATEGORY', categoryId: { in: categoryIds } }],
      },
      select: { scope: true, vendorId: true, categoryId: true, ratePct: true, effectiveFrom: true },
    });
    return computeCommission(rules, vendorId, lines, discount, at);
  }
}

export function computeCommission(rules: RuleRow[], vendorId: string, lines: CommissionLine[], discount: Money, at: Date): CommissionResult {
  const subtotal = sum(lines.map((l) => l.lineTotal));
  if (subtotal.lte(0)) return { ratePct: ZERO, amount: ZERO, vendorEarning: ZERO };

  const keep = subtotal.minus(discount).div(subtotal); // share of each line that is actually paid
  const parts = lines.map((l) => {
    const rate = resolveRate(rules, vendorId, l.categoryId, at);
    if (!rate) {
      throw new AppException('COMMISSION_NOT_CONFIGURED', 'Commission is not configured; orders cannot be priced.', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return l.lineTotal.mul(keep).mul(rate).div(100);
  });
  const amount = round2(sum(parts));
  const paid = subtotal.minus(discount);
  return {
    ratePct: round2(paid.gt(0) ? amount.div(paid).mul(100) : ZERO),
    amount,
    vendorEarning: round2(paid.minus(amount)),
  };
}

