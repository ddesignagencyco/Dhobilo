import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LedgerType, PayoutMethod, PayoutStatus, Prisma, Role } from '@prisma/client';
import { FieldCrypto } from '../../common/crypto/field-crypto';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { fmt, money, round2 } from '../../common/money/money';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, beforeCursor, sliceWithCursor } from '../../common/pagination/cursor';
import { Clock } from '../../common/time/clock';
import type { Env } from '../../config/env';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { normalizePkMobile } from '../auth/phone.util';
import { NotificationsService } from '../notifications/notifications.service';
import { ListPayoutsQueryDto, RequestPayoutDto } from './dto/finance.dto';
import { LedgerService } from './ledger.service';

export const PAYOUT_ACCOUNT_CONTEXT = 'payout.account';

/** IBAN check digits: move the first four characters to the end, turn letters into numbers (A=10 ... Z=35), the result mod 97 must be 1. */
export function validIbanChecksum(iban: string): boolean {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const digits = [...rearranged].map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c)).join('');
  let rest = 0;
  for (const ch of digits) rest = (rest * 10 + Number(ch)) % 97;
  return rest === 1;
}

/** A Pakistani IBAN is PK + 2 check digits + 4 letters (bank) + 16 digits (account) = 24 characters. */
export function normalizeIban(input: string): string | null {
  const iban = input.replace(/\s+/g, '').toUpperCase();
  return /^PK\d{2}[A-Z]{4}\d{16}$/.test(iban) && validIbanChecksum(iban) ? iban : null;
}

export function maskAccount(method: PayoutMethod, account: string): string {
  return method === PayoutMethod.BANK ? `${account.slice(0, 4)}${'*'.repeat(account.length - 8)}${account.slice(-4)}` : `${account.slice(0, 6)}***${account.slice(-3)}`;
}

type Db = Prisma.TransactionClient | PrismaService;

/** Newest-first paging over (requestedAt, id): the shared cursor speaks `createdAt`, payouts call it `requestedAt`. */
function beforeRequested(cursor: string | undefined) {
  const f = beforeCursor(cursor) as { OR?: Record<string, unknown>[] };
  return f.OR ? { OR: f.OR.map((o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k === 'createdAt' ? 'requestedAt' : k, v]))) } : {};
}

const select = {
  id: true,
  vendorId: true,
  amount: true,
  method: true,
  accountMask: true,
  status: true,
  requestedAt: true,
  processedAt: true,
  processedBy: true,
  txnRef: true,
  note: true,
} satisfies Prisma.PayoutSelect;

type Row = Prisma.PayoutGetPayload<{ select: typeof select }>;
const view = (p: Row) => ({ ...p, amount: fmt(money(p.amount)), currency: 'PKR' as const });

/**
 * Vendor withdrawals (FR-V9, TRD §13.2). A request reserves its amount against the vendor's balance; the ledger is only
 * debited when an admin has actually sent the money. Everything that touches a vendor's money takes the same
 * per-vendor lock, so two requests (or a request and a payment) racing each other cannot overdraw the balance.
 */
@Injectable()
export class PayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly crypto: FieldCrypto,
    private readonly config: ConfigService<Env, true>,
    private readonly clock: Clock,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private lock(tx: Db, vendorId: string) {
    return (tx as Prisma.TransactionClient).$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'vendor-money:' + vendorId}))`;
  }

  /** The vendor asks to withdraw. Checks the account details, the minimum and the available balance. */
  async request(vendorId: string, userId: string, dto: RequestPayoutDto) {
    const amount = round2(money(dto.amount));
    const min = this.config.get('PAYOUT_MIN_PKR', { infer: true });
    if (amount.lt(min)) throw new AppException('PAYOUT_BELOW_MINIMUM', `The smallest payout is Rs ${min}.`, HttpStatus.BAD_REQUEST, { min: fmt(money(min)) });

    let account: string | null;
    if (dto.method === PayoutMethod.BANK) {
      account = normalizeIban(dto.account);
      if (!account) throw new AppException('INVALID_ACCOUNT', 'Enter a valid Pakistani IBAN (PK + 22 characters).', HttpStatus.BAD_REQUEST);
    } else {
      account = normalizePkMobile(dto.account);
      if (!account) throw new AppException('INVALID_ACCOUNT', 'Enter the mobile number of your JazzCash or Easypaisa wallet.', HttpStatus.BAD_REQUEST);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, vendorId);
      const available = await this.ledger.available(tx, vendorId);
      if (amount.gt(available)) {
        throw new AppException('INSUFFICIENT_BALANCE', 'You cannot withdraw more than your available balance.', HttpStatus.CONFLICT, { available: fmt(available), requested: fmt(amount) });
      }
      return tx.payout.create({
        data: { vendorId, amount, method: dto.method, accountRef: this.crypto.encrypt(account!, PAYOUT_ACCOUNT_CONTEXT), accountMask: maskAccount(dto.method, account!), status: PayoutStatus.REQUESTED },
        select,
      });
    });
    await this.audit.record({ action: 'PAYOUT_REQUESTED', entity: 'Payout', entityId: created.id, actorId: userId, actorRole: Role.VENDOR_OWNER, after: { amount: fmt(amount), method: dto.method } });
    return view(created);
  }

  async listForVendor(vendorId: string, cursor: string | undefined, limit = DEFAULT_PAGE_SIZE) {
    const take = Math.min(limit, MAX_PAGE_SIZE);
    const rows = await this.prisma.payout.findMany({ where: { vendorId, ...beforeRequested(cursor) }, orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }], take: take + 1, select });
    return this.page(rows, take);
  }

  // ───────────────────────── admin ─────────────────────────

  async list(q: ListPayoutsQueryDto) {
    const take = Math.min(q.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const rows = await this.prisma.payout.findMany({
      where: { ...(q.status ? { status: q.status } : {}), ...(q.vendorId ? { vendorId: q.vendorId } : {}), ...beforeRequested(q.cursor) },
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      select: { ...select, vendor: { select: { businessName: true } } },
    });
    const names = new Map(rows.map((r) => [r.id, r.vendor.businessName]));
    const page = this.page(rows.map(({ vendor: _vendor, ...r }) => r), take);
    return { items: page.items.map((p) => ({ ...p, vendorName: names.get(p.id) ?? null })), nextCursor: page.nextCursor };
  }

  /** The full payout including the real account number, which only an admin who is about to pay it may see. Every view is audited. */
  async detail(id: string, adminId: string, requestId?: string) {
    const p = await this.prisma.payout.findUnique({ where: { id }, select: { ...select, accountRef: true, vendor: { select: { businessName: true } } } });
    if (!p) throw this.notFound();
    await this.audit.record({ action: 'PAYOUT_ACCOUNT_VIEWED', entity: 'Payout', entityId: id, actorId: adminId, actorRole: Role.ADMIN, requestId });
    const { accountRef, vendor, ...rest } = p;
    return { ...view(rest), vendorName: vendor.businessName, account: this.crypto.decrypt(accountRef, PAYOUT_ACCOUNT_CONTEXT) };
  }

  approve(id: string, adminId: string, requestId?: string) {
    return this.move(id, adminId, [PayoutStatus.REQUESTED], PayoutStatus.APPROVED, {}, 'PAYOUT_APPROVED', requestId);
  }

  reject(id: string, adminId: string, reason: string, requestId?: string) {
    return this.move(id, adminId, [PayoutStatus.REQUESTED, PayoutStatus.APPROVED], PayoutStatus.REJECTED, { note: reason }, 'PAYOUT_REJECTED', requestId, reason);
  }

  /** The money has been sent: record the transfer reference and debit the vendor's ledger. Re-checks the balance. */
  async pay(id: string, adminId: string, txnRef: string, note: string | undefined, requestId?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const p = await tx.payout.findUnique({ where: { id }, select: { vendorId: true, amount: true, status: true } });
      if (!p) throw this.notFound();
      await this.lock(tx, p.vendorId);
      const current = await tx.payout.findUniqueOrThrow({ where: { id }, select: { status: true, amount: true, vendorId: true } });
      if (current.status !== PayoutStatus.APPROVED) {
        throw new AppException('PAYOUT_INVALID_TRANSITION', `A ${current.status.toLowerCase()} payout cannot be paid (it must be approved first).`, HttpStatus.CONFLICT, { status: current.status });
      }
      // Other open requests are already reserved against the balance; this one is part of that reservation.
      const balance = await this.ledger.balance(tx, current.vendorId);
      if (money(current.amount).gt(balance)) {
        throw new AppException('INSUFFICIENT_BALANCE', 'The vendor’s balance no longer covers this payout (a refund may have been taken back).', HttpStatus.CONFLICT, { balance: fmt(balance), amount: fmt(money(current.amount)) });
      }
      await tx.ledgerEntry.create({ data: { vendorId: current.vendorId, payoutId: id, type: LedgerType.PAYOUT, amount: money(current.amount).negated(), note: `Payout ${txnRef}` } });
      return tx.payout.update({ where: { id }, data: { status: PayoutStatus.PAID, processedAt: this.clock.now(), processedBy: adminId, txnRef, ...(note ? { note } : {}) }, select });
    });
    await this.audit.record({ action: 'PAYOUT_PAID', entity: 'Payout', entityId: id, actorId: adminId, actorRole: Role.ADMIN, after: { txnRef, amount: fmt(money(result.amount)) }, requestId });
    await this.tellVendor(result.vendorId, `Dhoblio: your payout of Rs ${fmt(money(result.amount))} has been sent (ref ${txnRef}).`, requestId);
    return view(result);
  }

  private async move(id: string, adminId: string, from: PayoutStatus[], to: PayoutStatus, data: Prisma.PayoutUpdateManyMutationInput, action: string, requestId?: string, reason?: string) {
    const existing = await this.prisma.payout.findUnique({ where: { id }, select: { vendorId: true } });
    if (!existing) throw this.notFound();
    const claimed = await this.prisma.payout.updateMany({ where: { id, status: { in: from } }, data: { ...data, status: to, processedBy: adminId, ...(to === PayoutStatus.REJECTED ? { processedAt: this.clock.now() } : {}) } });
    if (claimed.count !== 1) {
      const now = await this.prisma.payout.findUniqueOrThrow({ where: { id }, select: { status: true } });
      throw new AppException('PAYOUT_INVALID_TRANSITION', `A ${now.status.toLowerCase()} payout cannot become ${to.toLowerCase()}.`, HttpStatus.CONFLICT, { from: now.status, to });
    }
    await this.audit.record({ action, entity: 'Payout', entityId: id, actorId: adminId, actorRole: Role.ADMIN, after: { status: to, reason: reason ?? null }, requestId });
    const row = await this.prisma.payout.findUniqueOrThrow({ where: { id }, select });
    if (to === PayoutStatus.REJECTED) await this.tellVendor(existing.vendorId, `Dhoblio: your payout request of Rs ${fmt(money(row.amount))} was not approved. ${reason ?? ''}`.trim(), requestId);
    return view(row);
  }

  private async tellVendor(vendorId: string, message: string, requestId?: string) {
    const v = await this.prisma.vendor.findUnique({ where: { id: vendorId }, select: { owner: { select: { phone: true } } } });
    if (v) await this.notifications.sendSms(v.owner.phone, message, requestId);
  }

  private page(rows: Row[], take: number) {
    const { items, nextCursor } = sliceWithCursor(rows.map((r) => ({ ...r, createdAt: r.requestedAt })), take);
    return { items: items.map(({ createdAt: _c, ...r }) => view(r)), nextCursor };
  }

  private notFound() {
    return new AppException(ErrorCode.NOT_FOUND, 'Payout not found.', HttpStatus.NOT_FOUND);
  }
}
