import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, RiderStatus, Role } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { FieldCrypto } from '../../common/crypto/field-crypto';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, afterCursor, sliceWithCursor } from '../../common/pagination/cursor';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService, VendorDecision } from '../notifications/notifications.service';
import { maskCnic } from '../vendors/cnic.util';
import { DeliveryJobsService } from './delivery-jobs.service';
import { ListRidersQueryDto } from './dto/rider.dto';
import { RIDER_CNIC_CONTEXT } from './rider-registration.service';
import { RiderPresenceService } from './rider-presence.service';

export interface ReviewContext {
  admin: AuthUser;
  ip?: string;
  requestId?: string;
}

interface Transition {
  from: RiderStatus[];
  to: RiderStatus;
  action: string;
  decision: VendorDecision;
  reason?: string;
  data: Prisma.RiderUpdateManyMutationInput;
}

/** Admin review of riders (FR-A2): approve, reject, suspend, reactivate, with an audit entry for each. */
@Injectable()
export class RiderReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: FieldCrypto,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly presence: RiderPresenceService,
    private readonly jobs: DeliveryJobsService,
  ) {}

  /** Oldest first, so applicants are served in the order they applied. */
  async list(q: ListRidersQueryDto) {
    const limit = Math.min(q.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const rows = await this.prisma.rider.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.cityId ? { cityId: q.cityId } : {}),
        ...(q.q ? { OR: [{ user: { name: { contains: q.q, mode: 'insensitive' } } }, { user: { phone: { contains: q.q } } }] } : {}),
        ...afterCursor(q.cursor),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      select: {
        id: true,
        status: true,
        cityId: true,
        isOnline: true,
        createdAt: true,
        user: { select: { name: true, phone: true } },
      },
    });
    return sliceWithCursor(rows, limit);
  }

  async detail(id: string) {
    const rider = await this.prisma.rider.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true, phone: true, email: true } } },
    });
    if (!rider) throw this.notFound();
    const [completed, active] = await Promise.all([
      this.prisma.deliveryJob.count({ where: { riderId: id, status: 'COMPLETED' } }),
      this.prisma.deliveryJob.count({ where: { riderId: id, status: { in: ['ASSIGNED', 'ACCEPTED', 'IN_TRANSIT'] } } }),
    ]);
    const { cnicEnc, cnicHash: _hash, photoPublicId: _pid, ...rest } = rider;
    return { ...rest, cnicMasked: maskCnic(this.crypto.decrypt(cnicEnc, RIDER_CNIC_CONTEXT)), completedJobs: completed, activeJobs: active };
  }

  /** Plaintext CNIC for an admin. Every reveal is written to the audit log first. */
  async revealCnic(id: string, ctx: ReviewContext) {
    const rider = await this.prisma.rider.findUnique({ where: { id }, select: { id: true, cnicEnc: true } });
    if (!rider) throw this.notFound();
    const cnic = this.crypto.decrypt(rider.cnicEnc, RIDER_CNIC_CONTEXT);
    await this.audit.record({
      action: 'RIDER_CNIC_VIEWED',
      entity: 'Rider',
      entityId: id,
      actorId: ctx.admin.id,
      actorRole: Role.ADMIN,
      ip: ctx.ip,
      requestId: ctx.requestId,
    });
    if (this.crypto.needsRotation(rider.cnicEnc)) {
      await this.prisma.rider.update({ where: { id }, data: { cnicEnc: this.crypto.encrypt(cnic, RIDER_CNIC_CONTEXT) } });
    }
    return { cnic: `${cnic.slice(0, 5)}-${cnic.slice(5, 12)}-${cnic.slice(12)}` };
  }

  approve(id: string, ctx: ReviewContext) {
    return this.transition(id, ctx, {
      from: [RiderStatus.PENDING],
      to: RiderStatus.APPROVED,
      action: 'RIDER_APPROVED',
      decision: 'APPROVED',
      data: { approvedAt: new Date(), approvedById: ctx.admin.id, rejectionReason: null },
    });
  }

  reject(id: string, reason: string, ctx: ReviewContext) {
    return this.transition(id, ctx, {
      from: [RiderStatus.PENDING],
      to: RiderStatus.REJECTED,
      action: 'RIDER_REJECTED',
      decision: 'REJECTED',
      reason,
      data: { rejectionReason: reason },
    });
  }

  /** A suspended rider goes offline and hands back any work they were holding. */
  suspend(id: string, reason: string, ctx: ReviewContext) {
    return this.transition(id, ctx, {
      from: [RiderStatus.APPROVED],
      to: RiderStatus.SUSPENDED,
      action: 'RIDER_SUSPENDED',
      decision: 'SUSPENDED',
      reason,
      data: { rejectionReason: reason, isOnline: false },
    });
  }

  /** Back to APPROVED but offline: the rider chooses when to start again. */
  reactivate(id: string, ctx: ReviewContext) {
    return this.transition(id, ctx, {
      from: [RiderStatus.SUSPENDED],
      to: RiderStatus.APPROVED,
      action: 'RIDER_REACTIVATED',
      decision: 'REACTIVATED',
      data: { rejectionReason: null },
    });
  }

  private async transition(id: string, ctx: ReviewContext, t: Transition) {
    const before = await this.prisma.$transaction(async (tx) => {
      const current = await tx.rider.findUnique({
        where: { id },
        select: { status: true, rejectionReason: true, cityId: true, user: { select: { phone: true, email: true } } },
      });
      if (!current) throw this.notFound();

      // Conditional update: of two admins acting at once, only one wins.
      const claimed = await tx.rider.updateMany({ where: { id, status: { in: t.from } }, data: { ...t.data, status: t.to } });
      if (claimed.count !== 1) {
        throw new AppException('RIDER_INVALID_TRANSITION', `A ${current.status.toLowerCase()} rider cannot be moved to ${t.to.toLowerCase()}.`, HttpStatus.CONFLICT, {
          from: current.status,
          to: t.to,
        });
      }
      await this.audit.record(
        {
          action: t.action,
          entity: 'Rider',
          entityId: id,
          actorId: ctx.admin.id,
          actorRole: Role.ADMIN,
          before: { status: current.status, reason: current.rejectionReason },
          after: { status: t.to, reason: t.reason ?? null },
          ip: ctx.ip,
          requestId: ctx.requestId,
        },
        tx,
      );
      return current;
    });

    if (t.to === RiderStatus.SUSPENDED) {
      await this.presence.remove(id, before.cityId);
      await this.jobs.releaseAllFor(id, 'The rider was suspended.', ctx.requestId);
    }
    await this.notifications.notifyRiderDecision(before.user, t.decision, t.reason, ctx.requestId);

    return this.prisma.rider.findUniqueOrThrow({
      where: { id },
      select: { id: true, status: true, isOnline: true, rejectionReason: true, approvedAt: true },
    });
  }

  private notFound(): AppException {
    return new AppException(ErrorCode.NOT_FOUND, 'Rider not found.', HttpStatus.NOT_FOUND);
  }
}
