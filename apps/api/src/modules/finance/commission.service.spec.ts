import { Prisma } from '@prisma/client';
import { money } from '../../common/money/money';
import { RuleRow, computeCommission, resolveRate } from './commission.service';

const D = (v: string) => new Prisma.Decimal(v);
const at = new Date('2026-10-22T10:00:00Z');
const day = (n: number) => new Date(Date.UTC(2026, 9, n));
const rule = (r: Partial<RuleRow> & Pick<RuleRow, 'scope' | 'ratePct'>): RuleRow => ({
  vendorId: null,
  categoryId: null,
  effectiveFrom: day(1),
  ...r,
});

const GLOBAL = rule({ scope: 'GLOBAL', ratePct: D('15') });

describe('resolveRate', () => {
  it('prefers vendor over category over global', () => {
    const rules = [
      GLOBAL,
      rule({ scope: 'CATEGORY', categoryId: 2, ratePct: D('12') }),
      rule({ scope: 'VENDOR', vendorId: 'v1', ratePct: D('8') }),
    ];
    expect(resolveRate(rules, 'v1', 2, at)?.toString()).toBe('8');
    expect(resolveRate(rules, 'other', 2, at)?.toString()).toBe('12');
    expect(resolveRate(rules, 'other', 3, at)?.toString()).toBe('15');
  });

  it('uses the latest rule that has already started, ignoring future ones', () => {
    const rules = [
      rule({ scope: 'GLOBAL', ratePct: D('10'), effectiveFrom: day(1) }),
      rule({ scope: 'GLOBAL', ratePct: D('15'), effectiveFrom: day(10) }),
      rule({ scope: 'GLOBAL', ratePct: D('25'), effectiveFrom: day(30) }), // not yet
    ];
    expect(resolveRate(rules, 'v', 1, at)?.toString()).toBe('15');
    expect(resolveRate(rules, 'v', 1, day(5))?.toString()).toBe('10');
    expect(resolveRate(rules, 'v', 1, day(31))?.toString()).toBe('25');
  });

  it('is null when nothing applies', () => {
    expect(resolveRate([], 'v', 1, at)).toBeNull();
    expect(resolveRate([rule({ scope: 'GLOBAL', ratePct: D('5'), effectiveFrom: day(30) })], 'v', 1, at)).toBeNull();
  });
});

describe('computeCommission', () => {
  it('applies the global rate to the whole order', () => {
    const r = computeCommission([GLOBAL], 'v', [{ categoryId: 1, lineTotal: money('1000') }], money(0), at);
    expect(r.amount.toString()).toBe('150');
    expect(r.ratePct.toString()).toBe('15');
    expect(r.vendorEarning.toString()).toBe('850');
  });

  it('blends the rate when categories have different rules', () => {
    const rules = [GLOBAL, rule({ scope: 'CATEGORY', categoryId: 2, ratePct: D('5') })];
    const r = computeCommission(rules, 'v', [{ categoryId: 1, lineTotal: money('600') }, { categoryId: 2, lineTotal: money('400') }], money(0), at);
    expect(r.amount.toString()).toBe('110'); // 90 + 20
    expect(r.ratePct.toString()).toBe('11');
    expect(r.vendorEarning.toString()).toBe('890');
  });

  it('reduces commission with a discount and keeps the money adding up', () => {
    const r = computeCommission([GLOBAL], 'v', [{ categoryId: 1, lineTotal: money('1000') }], money('200'), at);
    expect(r.amount.toString()).toBe('120'); // 15% of the 800 actually paid
    expect(r.vendorEarning.plus(r.amount).toString()).toBe('800');
  });

  it('rounds to whole paisa and never loses money to rounding', () => {
    const r = computeCommission([GLOBAL], 'v', [{ categoryId: 1, lineTotal: money('33.33') }, { categoryId: 1, lineTotal: money('66.67') }], money(0), at);
    expect(r.amount.plus(r.vendorEarning).toString()).toBe('100');
    const odd = computeCommission([rule({ scope: 'GLOBAL', ratePct: D('12.5') })], 'v', [{ categoryId: 1, lineTotal: money('10.01') }], money(0), at);
    expect(odd.amount.toString()).toBe('1.25'); // 1.25125 -> 1.25
    expect(odd.amount.plus(odd.vendorEarning).toString()).toBe('10.01');
  });

  it('fails loudly when no rule is configured', () => {
    expect(() => computeCommission([], 'v', [{ categoryId: 1, lineTotal: money('100') }], money(0), at)).toThrow(/not configured/);
  });

  it('is zero for an empty order', () => {
    expect(computeCommission([GLOBAL], 'v', [], money(0), at).amount.toString()).toBe('0');
  });
});
