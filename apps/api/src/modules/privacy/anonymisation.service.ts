import { createHash } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { DeletionStatus, Prisma, RiderStatus, UserStatus, VendorStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { Clock } from '../../common/time/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { QUEUES } from '../../infra/queue/queues';
import { AuditService } from '../audit/audit.service';
import { DeletionBlockersService } from './deletion-blockers.service';
import { DELETE_MEDIA_ASSET_JOB, DELETED_USER_NAME } from './privacy.constants';

export type AnonymiseOutcome =
  | { done: true; counts: Record<string, number> }
  | { done: false; reason: 'NOT_PENDING' | 'LEGAL_HOLD' | 'BLOCKED' | 'NOT_DUE'; detail?: string };

export interface RunSummary {
  due: number;
  completed: number;
  deferred: number;
  failed: number;
}


/**
 * Turns an account whose grace period is over into an anonymised tombstone (BE-9.5).
 *
 * The user row is kept so orders, payments, payouts and the ledger keep their references; everything that says who
 * the person was is removed or blanked. The whole job is one transaction: it either happens completely or not at
 * all, so running it again after a crash is always safe. Asset deletions are queued inside the transaction, so a
 * queue failure rolls the anonymisation back instead of leaving documents behind.
 */
@Injectable()
export class AnonymisationService {
  private readonly logger = new Logger(AnonymisationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly blockers: DeletionBlockersService,
    private readonly clock: Clock,
    @InjectQueue(QUEUES.MEDIA) private readonly media: Queue,
  ) {}

  /** Processes every request whose grace period has ended. One failing account never stops the others. */
  async runDue(limit = 100): Promise<RunSummary> {
    const due = await this.prisma.accountDeletionRequest.findMany({
      where: { status: DeletionStatus.PENDING, scheduledFor: { lte: this.clock.now() } },
      orderBy: { scheduledFor: 'asc' },
      take: limit,
      select: { id: true },
    });
    const summary: RunSummary = { due: due.length, completed: 0, deferred: 0, failed: 0 };
    for (const { id } of due) {
      try {
        const outcome = await this.anonymise(id);
        if (outcome.done) summary.completed++;
        else summary.deferred++;
      } catch (err) {
        summary.failed++;
        // The error name only: messages from the database can contain the values that were being written.
        const name = err instanceof Error ? err.name : 'Error';
        this.logger.error({ requestId: id, error: name }, 'Account anonymisation failed; it will be retried');
        await this.prisma.accountDeletionRequest
          .update({ where: { id }, data: { attempts: { increment: 1 }, lastAttemptAt: this.clock.now(), lastError: `ERROR:${name}`.slice(0, 80) } })
          .catch(() => undefined);
      }
    }
    return summary;
  }

  async anonymise(requestId: string): Promise<AnonymiseOutcome> {
    const request = await this.prisma.accountDeletionRequest.findUnique({ where: { id: requestId } });
    if (!request || request.status !== DeletionStatus.PENDING) return { done: false, reason: 'NOT_PENDING' };
    if (request.scheduledFor > this.clock.now()) return { done: false, reason: 'NOT_DUE' };

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: request.userId } });
    if (user.legalHoldAt) return this.defer(requestId, 'LEGAL_HOLD', 'LEGAL_HOLD');
    const blocking = await this.blockers.find(user);
    if (blocking.length > 0) {
      const codes = blocking.map((b) => b.code).join(',');
      return this.defer(requestId, 'BLOCKED', `BLOCKED:${codes}`.slice(0, 80));
    }

    const counts = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`anonymise:${user.id}`}))`;
      // Re-check under the lock: the user may have cancelled a moment ago, or an admin set a hold.
      const [again, fresh] = await Promise.all([
        tx.accountDeletionRequest.findUnique({ where: { id: requestId }, select: { status: true } }),
        tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { legalHoldAt: true } }),
      ]);
      if (again?.status !== DeletionStatus.PENDING || fresh.legalHoldAt) return null;
      return this.scrub(tx, user.id, user.phone, requestId);
    }, { timeout: 120_000, maxWait: 10_000 });

    if (!counts) return { done: false, reason: 'NOT_PENDING' };
    return { done: true, counts };
  }

  private async defer(requestId: string, reason: 'LEGAL_HOLD' | 'BLOCKED', lastError: string): Promise<AnonymiseOutcome> {
    await this.prisma.accountDeletionRequest.update({
      where: { id: requestId },
      data: { attempts: { increment: 1 }, lastAttemptAt: this.clock.now(), lastError },
    });
    return { done: false, reason, detail: lastError };
  }

  private async scrub(tx: Prisma.TransactionClient, userId: string, oldPhone: string, requestId: string): Promise<Record<string, number>> {
    const now = this.clock.now();
    const assets = new Set<string>();
    const counts: Record<string, number> = {};

    // ── vendor owner: shop becomes inactive; CNIC and documents go ──
    const vendor = await tx.vendor.findUnique({ where: { ownerId: userId }, select: { id: true } });
    if (vendor) {
      for (const d of await tx.vendorDocument.findMany({ where: { vendorId: vendor.id }, select: { publicId: true } })) assets.add(d.publicId);
      counts.vendorDocuments = (await tx.vendorDocument.deleteMany({ where: { vendorId: vendor.id } })).count;
      counts.staffLinks = (await tx.vendorStaff.deleteMany({ where: { vendorId: vendor.id } })).count;
      await tx.serviceItem.updateMany({ where: { vendorId: vendor.id }, data: { isActive: false } });
      await tx.vendor.update({
        where: { id: vendor.id },
        data: {
          status: VendorStatus.SUSPENDED,
          availability: 'CLOSED',
          description: null,
          rejectionReason: null,
          addressLine: 'Removed at the owner\'s request',
          cnicEnc: '',
          cnicHash: `deleted:${vendor.id}`,
        },
      });
      // Coordinates blurred to roughly a kilometre; payout accounts reduced to their last four characters.
      await tx.$executeRaw`UPDATE "Vendor" SET "lat" = round("lat"::numeric, 2)::float8, "lng" = round("lng"::numeric, 2)::float8 WHERE "id" = ${vendor.id}::uuid`;
      counts.payoutsMasked = await tx.$executeRaw`UPDATE "Payout" SET "accountRef" = '****' || right("accountRef", 4), "note" = NULL WHERE "vendorId" = ${vendor.id}::uuid`;
    }

    // ── rider: application data and last known position go ──
    const rider = await tx.rider.findUnique({ where: { userId }, select: { id: true, photoPublicId: true } });
    if (rider) {
      if (rider.photoPublicId) assets.add(rider.photoPublicId);
      await tx.rider.update({
        where: { id: rider.id },
        data: { status: RiderStatus.SUSPENDED, isOnline: false, lastLat: null, lastLng: null, lastSeenAt: null, photoUrl: null, photoPublicId: null, rejectionReason: null, cnicEnc: '', cnicHash: `deleted:${rider.id}` },
      });
    }

    // ── customer data: address book, carts, delivery addresses frozen on orders, complaint photos ──
    counts.carts = (await tx.cart.deleteMany({ where: { customerId: userId } })).count;
    counts.orders = await tx.$executeRaw`
      UPDATE "Order" SET
        "addressSnapshot" = jsonb_build_object(
          'area', "addressSnapshot"->'area', 'cityId', "addressSnapshot"->'cityId',
          'lat', round(("addressSnapshot"->>'lat')::numeric, 2), 'lng', round(("addressSnapshot"->>'lng')::numeric, 2),
          'scrubbed', true),
        "customerNote" = NULL, "addressId" = NULL
      WHERE "customerId" = ${userId}::uuid`;
    counts.addresses = (await tx.address.deleteMany({ where: { userId } })).count;
    for (const c of await tx.complaint.findMany({ where: { customerId: userId, attachments: { not: Prisma.JsonNull } }, select: { id: true, attachments: true } })) {
      if (Array.isArray(c.attachments)) {
        for (const a of c.attachments as Array<{ publicId?: unknown }>) if (typeof a?.publicId === 'string') assets.add(a.publicId);
      }
      await tx.complaint.update({ where: { id: c.id }, data: { attachments: Prisma.JsonNull } });
    }

    // ── contact and technical data ──
    counts.notifications = (await tx.notification.deleteMany({ where: { userId } })).count;
    counts.sessions = (await tx.session.deleteMany({ where: { userId } })).count;
    counts.deviceTokens = (await tx.deviceToken.deleteMany({ where: { userId } })).count;
    counts.otpCodes = (await tx.otpCode.deleteMany({ where: { phone: oldPhone } })).count;

    // ── the account itself: phone is replaced by a unique placeholder, so the number can sign up again later ──
    await tx.user.update({
      where: { id: userId },
      data: {
        status: UserStatus.DELETED,
        phone: `deleted:${userId}`,
        email: null,
        passwordHash: null,
        name: DELETED_USER_NAME,
        referralCode: null,
        notificationPrefs: Prisma.JsonNull,
        phoneVerifiedAt: null,
        lastLoginAt: null,
        legalHoldAt: null,
        legalHoldReason: null,
        legalHoldById: null,
        deletedAt: now,
      },
    });

    // ── files: queued inside the transaction, so a queue failure rolls everything back ──
    for (const publicId of assets) {
      const jobId = `del-${createHash('sha1').update(publicId).digest('hex')}`;
      await this.media.add(DELETE_MEDIA_ASSET_JOB, { publicId }, { jobId });
    }
    counts.mediaAssetsQueued = assets.size;

    await tx.accountDeletionRequest.update({
      where: { id: requestId },
      data: { status: DeletionStatus.COMPLETED, completedAt: now, lastError: null, attempts: { increment: 1 }, lastAttemptAt: now },
    });
    await this.audit.record({ action: 'ACCOUNT_ANONYMISED', entity: 'User', entityId: userId, after: { requestId, counts } }, tx);
    return counts;
  }
}

