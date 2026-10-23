import { HttpStatus, Injectable } from '@nestjs/common';
import { CommissionScope, LedgerType, Prisma, Role } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { fmt, money, round2 } from '../../common/money/money';
import { Clock } from '../../common/time/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateCommissionRuleDto, LedgerAdjustmentDto, ListCommissionRulesQueryDto } from './dto/finance.dto';

const view = (r: { id: string; scope: CommissionScope; vendorId: string | null; categoryId: number | null; ratePct: Prisma.Decimal; effectiveFrom: Date; createdById: string | null }) => ({ ...r, ratePct: fmt(money(r.ratePct)) });

/** Clock skew allowance when someone picks "now" as the start time. */
const PAST_GRACE_MS = 60_000;

/**
 * Commission settings (FR-A3). Rules are never edited: a change is a new rule with a start time, and the rate in force
 * for an order is the newest rule that had started when the order was placed (and is then copied onto the order).
 * That keeps history truthful. Only rules that have not started yet can be removed.
 */
@Injectable()
export class CommissionAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly audit: AuditService,
  ) {}

  async list(q: ListCommissionRulesQueryDto) {
    const rows = await this.prisma.commissionRule.findMany({
      where: { ...(q.scope ? { scope: q.scope } : {}), ...(q.vendorId ? { vendorId: q.vendorId } : {}) },
      orderBy: [{ scope: 'asc' }, { effectiveFrom: 'desc' }],
      take: 200,
    });
    const now = this.clock.now();
    // Mark which rule is in force right now for each target.
    const inForce = new Set<string>();
    for (const r of rows.filter((x) => x.effectiveFrom <= now)) {
      const key = `${r.scope}:${r.vendorId ?? ''}:${r.categoryId ?? ''}`;
      if (!inForce.has(key)) {
        inForce.add(key);
        (r as typeof r & { current?: boolean }).current = true;
      }
    }
    return rows.map((r) => ({ ...view(r), current: (r as typeof r & { current?: boolean }).current === true, startsInFuture: r.effectiveFrom > now }));
  }

  async create(dto: CreateCommissionRuleDto, adminId: string, requestId?: string) {
    const bad = (message: string, code = 'INVALID_COMMISSION_RULE') => new AppException(code, message, HttpStatus.BAD_REQUEST);
    if (dto.scope === CommissionScope.GLOBAL && (dto.vendorId || dto.categoryId)) throw bad('A global rule has no vendor or category.');
    if (dto.scope === CommissionScope.VENDOR && (!dto.vendorId || dto.categoryId)) throw bad('A vendor rule needs a vendorId (and no category).');
    if (dto.scope === CommissionScope.CATEGORY && (!dto.categoryId || dto.vendorId)) throw bad('A category rule needs a categoryId (and no vendor).');
    if (dto.vendorId && !(await this.prisma.vendor.findUnique({ where: { id: dto.vendorId }, select: { id: true } }))) throw new AppException(ErrorCode.NOT_FOUND, 'Vendor not found.', HttpStatus.NOT_FOUND);
    if (dto.categoryId && !(await this.prisma.serviceCategory.findUnique({ where: { id: dto.categoryId }, select: { id: true } }))) throw new AppException(ErrorCode.NOT_FOUND, 'Service category not found.', HttpStatus.NOT_FOUND);

    const now = this.clock.now();
    const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : now;
    if (effectiveFrom.getTime() < now.getTime() - PAST_GRACE_MS) throw bad('The start time cannot be in the past: orders already placed keep their rate.', 'EFFECTIVE_DATE_IN_PAST');

    const clash = await this.prisma.commissionRule.findFirst({ where: { scope: dto.scope, vendorId: dto.vendorId ?? null, categoryId: dto.categoryId ?? null, effectiveFrom }, select: { id: true } });
    if (clash) throw new AppException('COMMISSION_RULE_EXISTS', 'There is already a rule for this target starting at that time.', HttpStatus.CONFLICT);

    const rule = await this.prisma.commissionRule.create({
      data: { scope: dto.scope, vendorId: dto.vendorId ?? null, categoryId: dto.categoryId ?? null, ratePct: round2(money(dto.ratePct)), effectiveFrom, createdById: adminId },
    });
    await this.audit.record({ action: 'COMMISSION_RULE_CREATED', entity: 'CommissionRule', entityId: rule.id, actorId: adminId, actorRole: Role.ADMIN, after: { scope: rule.scope, vendorId: rule.vendorId, categoryId: rule.categoryId, ratePct: fmt(money(rule.ratePct)), effectiveFrom: rule.effectiveFrom.toISOString() }, requestId });
    return { ...view(rule), startsInFuture: rule.effectiveFrom > now };
  }

  async remove(id: string, adminId: string, requestId?: string) {
    const rule = await this.prisma.commissionRule.findUnique({ where: { id } });
    if (!rule) throw new AppException(ErrorCode.NOT_FOUND, 'Commission rule not found.', HttpStatus.NOT_FOUND);
    if (rule.effectiveFrom <= this.clock.now()) {
      throw new AppException('COMMISSION_RULE_ACTIVE', 'A rule that has already started cannot be removed. Add a newer rule instead.', HttpStatus.CONFLICT);
    }
    await this.prisma.commissionRule.delete({ where: { id } });
    await this.audit.record({ action: 'COMMISSION_RULE_REMOVED', entity: 'CommissionRule', entityId: id, actorId: adminId, actorRole: Role.ADMIN, before: { scope: rule.scope, ratePct: fmt(money(rule.ratePct)), effectiveFrom: rule.effectiveFrom.toISOString() }, requestId });
  }

  /** A correction to a vendor's ledger. History is never edited, so a mistake is fixed with a new, explained entry. */
  async adjust(dto: LedgerAdjustmentDto, adminId: string, requestId?: string) {
    const amount = round2(money(dto.amount));
    if (amount.isZero()) throw new AppException('INVALID_ADJUSTMENT', 'An adjustment cannot be zero.', HttpStatus.BAD_REQUEST);
    if (!(await this.prisma.vendor.findUnique({ where: { id: dto.vendorId }, select: { id: true } }))) throw new AppException(ErrorCode.NOT_FOUND, 'Vendor not found.', HttpStatus.NOT_FOUND);
    const entry = await this.prisma.ledgerEntry.create({ data: { vendorId: dto.vendorId, type: LedgerType.ADJUSTMENT, amount, note: dto.note } });
    await this.audit.record({ action: 'LEDGER_ADJUSTED', entity: 'LedgerEntry', entityId: entry.id, actorId: adminId, actorRole: Role.ADMIN, after: { vendorId: dto.vendorId, amount: fmt(amount), note: dto.note }, requestId });
    return { id: entry.id, vendorId: entry.vendorId, type: entry.type, amount: fmt(amount), note: entry.note, createdAt: entry.createdAt };
  }
}
