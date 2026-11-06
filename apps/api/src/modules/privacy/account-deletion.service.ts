import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeletionStatus, Prisma, Role, UserStatus } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { AppException } from '../../common/errors/app.exception';
import { decodeCursor, DEFAULT_PAGE_SIZE } from '../../common/pagination/cursor';
import { Clock } from '../../common/time/clock';
import type { Env } from '../../config/env';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OtpService } from '../auth/otp.service';
import { TokenService } from '../auth/token.service';
import { ListDeletionRequestsQueryDto, RequestDeletionDto } from './dto/privacy.dto';
import { DeletionBlockersService } from './deletion-blockers.service';

const DAY_MS = 86_400_000;

export interface RequestContext {
  ip?: string;
  requestId?: string;
}

const maskPhone = (phone: string) => (phone.startsWith('+92') ? `${phone.slice(0, 5)}*****${phone.slice(-2)}` : '***');

/** "Delete my account" (self-service) plus the admin side: the request queue and legal holds. */
@Injectable()
export class AccountDeletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly blockers: DeletionBlockersService,
    private readonly clock: Clock,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async request(auth: AuthUser, dto: RequestDeletionDto, ctx: RequestContext) {
    if (auth.role === Role.ADMIN) {
      throw new AppException('DELETION_NOT_AVAILABLE', 'Admin accounts are removed by a super admin, not here.', HttpStatus.FORBIDDEN);
    }
    if (auth.role === Role.VENDOR_STAFF) {
      throw new AppException('STAFF_REMOVED_BY_OWNER', 'Shop staff accounts are removed by the shop owner.', HttpStatus.FORBIDDEN);
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.id } });

    if (await this.prisma.accountDeletionRequest.findFirst({ where: { userId: user.id, status: DeletionStatus.PENDING }, select: { id: true } })) {
      throw new AppException('DELETION_ALREADY_REQUESTED', 'A deletion request is already open for this account.', HttpStatus.CONFLICT);
    }

    // Blockers first: it does not need the code, and a wrong refusal must not burn the user's code.
    const blocking = await this.blockers.find(user);
    if (blocking.length > 0) {
      throw new AppException('DELETION_BLOCKED', 'Finish these before deleting your account.', HttpStatus.CONFLICT, { blockers: blocking });
    }

    await this.otp.verify(user.phone, dto.code, ctx.ip ?? 'unknown');

    const now = this.clock.now();
    const grace = this.config.get('ACCOUNT_DELETION_GRACE_DAYS', { infer: true });
    const scheduledFor = new Date(now.getTime() + grace * DAY_MS);
    let created;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.accountDeletionRequest.create({
          data: { userId: user.id, roleAtRequest: user.role, reasonCode: dto.reasonCode, requestedAt: now, scheduledFor },
        });
        await tx.user.update({ where: { id: user.id }, data: { status: UserStatus.PENDING_DELETION } });
        // Stop taking work straight away; the data itself stays until the grace period ends.
        await tx.vendor.updateMany({ where: { ownerId: user.id }, data: { availability: 'CLOSED' } });
        await tx.rider.updateMany({ where: { userId: user.id }, data: { isOnline: false } });
        await tx.deviceToken.deleteMany({ where: { userId: user.id } });
        await this.audit.record(
          { action: 'ACCOUNT_DELETION_REQUESTED', entity: 'User', entityId: user.id, actorId: user.id, actorRole: user.role, after: { requestId: row.id, scheduledFor: scheduledFor.toISOString() }, ip: ctx.ip, requestId: ctx.requestId },
          tx,
        );
        return row;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppException('DELETION_ALREADY_REQUESTED', 'A deletion request is already open for this account.', HttpStatus.CONFLICT);
      }
      throw err;
    }
    await this.tokens.revokeAllForUser(user.id);
    return this.view(created);
  }

  /** The user's current (or last) request. */
  async status(userId: string) {
    const row = await this.prisma.accountDeletionRequest.findFirst({ where: { userId }, orderBy: { requestedAt: 'desc' } });
    return row ? this.view(row) : { status: 'NONE' as const, canCancel: false };
  }

  /** Keeps the account. Allowed until the data has actually been anonymised. */
  async cancel(userId: string, ctx: RequestContext) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`anonymise:${userId}`}))`;
      const open = await tx.accountDeletionRequest.findFirst({ where: { userId, status: DeletionStatus.PENDING } });
      if (!open) throw new AppException('DELETION_NOT_REQUESTED', 'There is no open deletion request.', HttpStatus.NOT_FOUND);
      const row = await tx.accountDeletionRequest.update({ where: { id: open.id }, data: { status: DeletionStatus.CANCELLED, cancelledAt: this.clock.now() } });
      await tx.user.updateMany({ where: { id: userId, status: UserStatus.PENDING_DELETION }, data: { status: UserStatus.ACTIVE } });
      await this.audit.record(
        { action: 'ACCOUNT_DELETION_CANCELLED', entity: 'User', entityId: userId, actorId: userId, after: { requestId: row.id }, ip: ctx.ip, requestId: ctx.requestId },
        tx,
      );
      return row;
    });
    return this.view(result);
  }

  private view(row: { id: string; status: DeletionStatus; requestedAt: Date; scheduledFor: Date; cancelledAt: Date | null; completedAt: Date | null }) {
    const msLeft = row.scheduledFor.getTime() - this.clock.now().getTime();
    return {
      id: row.id,
      status: row.status,
      requestedAt: row.requestedAt,
      scheduledFor: row.scheduledFor,
      cancelledAt: row.cancelledAt,
      completedAt: row.completedAt,
      daysLeft: row.status === DeletionStatus.PENDING ? Math.max(0, Math.ceil(msLeft / DAY_MS)) : 0,
      canCancel: row.status === DeletionStatus.PENDING,
    };
  }

  // ───── admin ─────

  /** Newest first. Shows who (masked phone, role) and where the request stands: never names or addresses. */
  async list(query: ListDeletionRequestsQueryDto) {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await this.prisma.accountDeletionRequest.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(cursor ? { OR: [{ requestedAt: { lt: cursor.createdAt } }, { requestedAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}),
      },
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { user: { select: { phone: true, status: true, legalHoldAt: true, legalHoldReason: true } } },
    });
    const items = rows.slice(0, limit).map((r) => ({
      id: r.id,
      userId: r.userId,
      role: r.roleAtRequest,
      status: r.status,
      phone: r.user.status === UserStatus.DELETED ? null : maskPhone(r.user.phone),
      reasonCode: r.reasonCode,
      requestedAt: r.requestedAt,
      scheduledFor: r.scheduledFor,
      completedAt: r.completedAt,
      attempts: r.attempts,
      lastError: r.lastError,
      legalHold: r.user.legalHoldAt !== null,
      legalHoldReason: r.user.legalHoldReason,
    }));
    const last = rows.length > limit ? rows[limit - 1] : null;
    const nextCursor = last ? Buffer.from(JSON.stringify({ t: last.requestedAt.toISOString(), i: last.id })).toString('base64url') : null;
    return { items, nextCursor };
  }

  async setLegalHold(admin: AuthUser, userId: string, reason: string, ctx: RequestContext) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, status: true, role: true } });
    if (!user) throw new AppException('NOT_FOUND', 'User not found.', HttpStatus.NOT_FOUND);
    if (user.status === UserStatus.DELETED) {
      throw new AppException('ALREADY_DELETED', 'This account has already been anonymised; there is nothing left to hold.', HttpStatus.CONFLICT);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { legalHoldAt: this.clock.now(), legalHoldReason: reason, legalHoldById: admin.id } });
      await this.audit.record({ action: 'USER_LEGAL_HOLD_SET', entity: 'User', entityId: userId, actorId: admin.id, actorRole: admin.role, after: { reason }, ip: ctx.ip, requestId: ctx.requestId }, tx);
    });
    return { userId, legalHold: true, reason };
  }

  async clearLegalHold(admin: AuthUser, userId: string, ctx: RequestContext) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, legalHoldAt: true } });
    if (!user) throw new AppException('NOT_FOUND', 'User not found.', HttpStatus.NOT_FOUND);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { legalHoldAt: null, legalHoldReason: null, legalHoldById: null } });
      await this.audit.record({ action: 'USER_LEGAL_HOLD_CLEARED', entity: 'User', entityId: userId, actorId: admin.id, actorRole: admin.role, ip: ctx.ip, requestId: ctx.requestId }, tx);
    });
    return { userId, legalHold: false };
  }
}
