import { HttpStatus, Injectable } from '@nestjs/common';
import { LedgerType, PayoutStatus, Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { fmt, money, parseMoney, sum } from '../../common/money/money';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor';
import { Clock } from '../../common/time/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ListPayoutsQueryDto, PayPayoutDto, RejectPayoutDto, RequestPayoutDto } from './dto/finance.dto';

const PENDING = [PayoutStatus.REQUESTED, PayoutStatus.APPROVED];

const mask = (ref: string) => `\u2022\u2022\u2022\u2022${ref.slice(-4)}`;

@Injectable()
export class PayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /** Vendor asks for money; the quote is re-checked under a lock so two requests cannot both spend the same balance. */
  async request(vendorId: string, dto: RequestPayoutDto) {
    const amount = parseMoney(dto.amount);
    if (!amount || amount.lte(0)) throw new AppException(ErrorCode.VALIDATION_FAILED, 'Enter a positive payout amount.', HttpStatus.BAD_REQUEST);
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, `payout:vendor:${vendorId}`);
      const available = await this.available(tx, vendorId);
      if (amount.gt(available)) {
        throw new AppException('PAYOUT_EXCEEDS_BALANCE', 'That is more than your available balance.', HttpStatus.CONFLICT, {
          available: fmt(available),
        });
      }
      const payout = await tx.payout.create({
        data: { vendorId, amount, method: dto.method, accountRef: dto.accountRef, note: dto.note },
      });
      return this.view(payout);
    });
  }

  async listMine(vendorId: string) {
    const payouts = await this.prisma.payout.findMany({
      where: { vendorId },
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
      take: 50,
    });
    return payouts.map((p) => this.view(p));
  }

  async list(q: ListPayoutsQueryDto) {
    const limit = q.limit ?? 20;
    const cursor = q.cursor ? decodeCursor(q.cursor) : null;
    const rows = await this.prisma.payout.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.vendorId ? { vendorId: q.vendorId } : {}),
        ...(cursor ? { OR: [{ requestedAt: { lt: cursor.createdAt } }, { requestedAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}),
      },
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { vendor: { select: { businessName: true } } },
    });
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((p) => ({ ...this.view(p), vendor: p.vendor }));
    const last = rows[limit - 1];
    return { items, nextCursor: hasMore && last ? encodeCursor({ createdAt: last.requestedAt, id: last.id }) : null };
  }

  async approve(id: string, adminId: string) {
    const changed = await this.prisma.payout.updateMany({
      where: { id, status: PayoutStatus.REQUESTED },
      data: { status: PayoutStatus.APPROVED, processedBy: adminId },
    });
    if (changed.count !== 1) throw this.conflict();
    return this.get(id);
  }

  async reject(id: string, adminId: string, dto: RejectPayoutDto) {
    const changed = await this.prisma.payout.updateMany({
      where: { id, status: { in: PENDING } },
      data: { status: PayoutStatus.REJECTED, processedAt: this.clock.now(), processedBy: adminId, note: dto.reason },
    });
    if (changed.count !== 1) throw this.conflict();
    return this.get(id);
  }

  /** Marks the transfer done and debits the vendor's ledger in one transaction. */
  async pay(id: string, adminId: string, dto: PayPayoutDto) {
    const payout = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, `ledger:payout:${id}`);
      const current = await tx.payout.findUnique({ where: { id } });
      if (!current) throw new AppException(ErrorCode.NOT_FOUND, 'Payout not found.', HttpStatus.NOT_FOUND);
      if (current.status !== PayoutStatus.APPROVED) throw this.conflict(current.status);
      const changed = await tx.payout.updateMany({
        where: { id, status: PayoutStatus.APPROVED },
        data: { status: PayoutStatus.PAID, processedAt: this.clock.now(), processedBy: adminId, txnRef: dto.txnRef },
      });
      if (changed.count !== 1) throw this.conflict();
      const already = await tx.ledgerEntry.findFirst({ where: { payoutId: id }, select: { id: true } });
      if (!already) {
        await tx.ledgerEntry.create({
          data: { vendorId: current.vendorId, payoutId: id, type: LedgerType.PAYOUT, amount: money(current.amount).neg(), note: 'Payout' },
        });
      }
      return tx.payout.findUniqueOrThrow({ where: { id } });
    });
    return this.view(payout);
  }

  private async get(id: string) {
    const payout = await this.prisma.payout.findUnique({ where: { id } });
    if (!payout) throw new AppException(ErrorCode.NOT_FOUND, 'Payout not found.', HttpStatus.NOT_FOUND);
    return this.view(payout);
  }

  private async available(tx: Prisma.TransactionClient, vendorId: string) {
    const [entries, payouts] = await Promise.all([
      tx.ledgerEntry.findMany({ where: { vendorId }, select: { amount: true } }),
      tx.payout.findMany({ where: { vendorId, status: { in: PENDING } }, select: { amount: true } }),
    ]);
    return sum(entries.map((e) => money(e.amount))).minus(sum(payouts.map((p) => money(p.amount))));
  }

  private view(p: { id: string; amount: Prisma.Decimal; method: string; accountRef: string; status: PayoutStatus; requestedAt: Date; processedAt: Date | null; processedBy: string | null; txnRef: string | null; note: string | null }) {
    return {
      id: p.id,
      amount: fmt(money(p.amount)),
      method: p.method,
      accountRef: mask(p.accountRef),
      status: p.status,
      requestedAt: p.requestedAt,
      processedAt: p.processedAt,
      processedBy: p.processedBy,
      txnRef: p.txnRef,
      note: p.note,
    };
  }

  private conflict(status?: PayoutStatus) {
    return new AppException('PAYOUT_INVALID_STATE', 'This payout has already moved on.', HttpStatus.CONFLICT, status ? { status } : {});
  }

  private lock(tx: Prisma.TransactionClient, key: string): Promise<number> {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }
}
