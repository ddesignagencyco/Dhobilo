import { createHash } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationStatus, OrderStatus, VendorStatus, RiderStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { Clock } from '../../common/time/clock';
import type { Env } from '../../config/env';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { QUEUES } from '../../infra/queue/queues';
import { DELETE_MEDIA_ASSET_JOB } from '../privacy/privacy.constants';

const DAY_MS = 86_400_000;
const YEAR_MS = 365 * DAY_MS;

export interface PurgeResult {
  /** True when nothing was changed: the numbers are what a real run would have removed. */
  dryRun: boolean;
  otpCodes: number;
  sessions: number;
  notifications: number;
  courierEvents: number;
  /** Old orders whose delivery address details and customer note were blanked. */
  orderPii: number;
  /** Rejected vendor/rider applications whose CNIC data and documents were deleted. */
  rejectedApplications: number;
  /** Not deleted by this job (legal evidence): how many records are already older than their retention window. */
  pastWindow: { financialOrders: number; auditLogs: number };
}

/**
 * Retention policy (BE-9.5, data minimisation; the full policy is docs/Dhoblio-DATA-PROTECTION.md). Operational records
 * that only matter for a short time are deleted on a schedule, and personal details are blanked once they are no longer
 * needed. Records the business or the law needs (orders and their amounts, payments, the ledger, payouts, the audit
 * log) are never deleted here; for those the job only reports how much is past its proposed window.
 *
 * - login codes: RETENTION_OTP_DAYS after they were issued
 * - sessions: RETENTION_SESSION_DAYS after they expired or were revoked
 * - notification log (message text, phone-related): RETENTION_NOTIFICATION_DAYS, once delivered or failed
 * - courier webhook payloads: RETENTION_WEBHOOK_EVENT_DAYS
 * - delivery address details and note on finished orders: RETENTION_ORDER_PII_DAYS (skipped for open complaints and legal holds)
 * - CNIC data and documents of rejected applications: RETENTION_REJECTED_APPLICATION_DAYS (skipped for legal holds)
 *
 * RETENTION_DRY_RUN=true makes every step only count.
 */
@Injectable()
export class RetentionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly config: ConfigService<Env, true>,
    @InjectQueue(QUEUES.MEDIA) private readonly media: Queue,
  ) {}

  private cutoff(days: number): Date {
    return new Date(this.clock.now().getTime() - days * DAY_MS);
  }

  async purge(): Promise<PurgeResult> {
    const dryRun = this.config.get('RETENTION_DRY_RUN', { infer: true });
    const days = (key: 'RETENTION_OTP_DAYS' | 'RETENTION_SESSION_DAYS' | 'RETENTION_NOTIFICATION_DAYS' | 'RETENTION_WEBHOOK_EVENT_DAYS') =>
      this.cutoff(this.config.get(key, { infer: true }));
    const sessionCutoff = days('RETENTION_SESSION_DAYS');

    const otpWhere = { createdAt: { lt: days('RETENTION_OTP_DAYS') } };
    const sessionWhere = { OR: [{ expiresAt: { lt: sessionCutoff } }, { revokedAt: { lt: sessionCutoff } }] };
    const notificationWhere = { createdAt: { lt: days('RETENTION_NOTIFICATION_DAYS') }, status: { in: [NotificationStatus.SENT, NotificationStatus.FAILED] } };
    const eventWhere = { createdAt: { lt: days('RETENTION_WEBHOOK_EVENT_DAYS') } };

    const [otp, sessions, notifications, events] = await Promise.all([
      dryRun ? this.prisma.otpCode.count({ where: otpWhere }) : this.prisma.otpCode.deleteMany({ where: otpWhere }).then((r) => r.count),
      dryRun ? this.prisma.session.count({ where: sessionWhere }) : this.prisma.session.deleteMany({ where: sessionWhere }).then((r) => r.count),
      dryRun ? this.prisma.notification.count({ where: notificationWhere }) : this.prisma.notification.deleteMany({ where: notificationWhere }).then((r) => r.count),
      dryRun ? this.prisma.courierWebhookEvent.count({ where: eventWhere }) : this.prisma.courierWebhookEvent.deleteMany({ where: eventWhere }).then((r) => r.count),
    ]);

    return {
      dryRun,
      otpCodes: otp,
      sessions,
      notifications,
      courierEvents: events,
      orderPii: await this.blankOldOrderDetails(dryRun),
      rejectedApplications: await this.deleteRejectedApplicationData(dryRun),
      pastWindow: await this.pastWindow(),
    };
  }

  /** Finished orders keep their amounts; the address lines and the customer's note go (coordinates are blurred to ~1 km). */
  async blankOldOrderDetails(dryRun: boolean): Promise<number> {
    const cutoff = this.cutoff(this.config.get('RETENTION_ORDER_PII_DAYS', { infer: true }));
    const done = [OrderStatus.DELIVERED, OrderStatus.CANCELLED, OrderStatus.REJECTED];
    if (dryRun) {
      const rows = await this.prisma.$queryRaw<Array<{ n: bigint }>>`
        SELECT count(*) AS n FROM "Order" o
        WHERE o."status"::text = ANY(${done}) AND o."createdAt" < ${cutoff}
          AND (NOT jsonb_exists(o."addressSnapshot", 'scrubbed') OR o."customerNote" IS NOT NULL)
          AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."id" = o."customerId" AND u."legalHoldAt" IS NOT NULL)
          AND NOT EXISTS (SELECT 1 FROM "Complaint" c WHERE c."orderId" = o."id" AND c."status"::text IN ('OPEN', 'IN_REVIEW', 'VENDOR_RESPONDED'))`;
      return Number(rows[0]?.n ?? 0);
    }
    return this.prisma.$executeRaw`
      UPDATE "Order" o SET
        "addressSnapshot" = jsonb_build_object(
          'area', o."addressSnapshot"->'area', 'cityId', o."addressSnapshot"->'cityId',
          'lat', round((o."addressSnapshot"->>'lat')::numeric, 2), 'lng', round((o."addressSnapshot"->>'lng')::numeric, 2),
          'scrubbed', true),
        "customerNote" = NULL, "addressId" = NULL
      WHERE o."status"::text = ANY(${done}) AND o."createdAt" < ${cutoff}
        AND (NOT jsonb_exists(o."addressSnapshot", 'scrubbed') OR o."customerNote" IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."id" = o."customerId" AND u."legalHoldAt" IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM "Complaint" c WHERE c."orderId" = o."id" AND c."status"::text IN ('OPEN', 'IN_REVIEW', 'VENDOR_RESPONDED'))`;
  }

  /** A rejected vendor/rider does not need their CNIC or document photos kept; the application row itself stays. */
  async deleteRejectedApplicationData(dryRun: boolean): Promise<number> {
    const cutoff = this.cutoff(this.config.get('RETENTION_REJECTED_APPLICATION_DAYS', { infer: true }));
    const vendors = await this.prisma.vendor.findMany({
      where: { status: VendorStatus.REJECTED, updatedAt: { lt: cutoff }, NOT: { cnicEnc: '' }, owner: { legalHoldAt: null } },
      select: { id: true, documents: { select: { publicId: true } } },
      take: 500,
    });
    const riders = await this.prisma.rider.findMany({
      where: { status: RiderStatus.REJECTED, updatedAt: { lt: cutoff }, NOT: { cnicEnc: '' }, user: { legalHoldAt: null } },
      select: { id: true, photoPublicId: true },
      take: 500,
    });
    if (dryRun) return vendors.length + riders.length;

    for (const v of vendors) {
      await this.prisma.$transaction(async (tx) => {
        await tx.vendorDocument.deleteMany({ where: { vendorId: v.id } });
        await tx.vendor.update({ where: { id: v.id }, data: { cnicEnc: '', cnicHash: `deleted:${v.id}` } });
        for (const d of v.documents) await this.queueAssetDeletion(d.publicId);
      });
    }
    for (const r of riders) {
      await this.prisma.$transaction(async (tx) => {
        await tx.rider.update({ where: { id: r.id }, data: { cnicEnc: '', cnicHash: `deleted:${r.id}`, photoUrl: null, photoPublicId: null } });
        if (r.photoPublicId) await this.queueAssetDeletion(r.photoPublicId);
      });
    }
    return vendors.length + riders.length;
  }

  /** Not deleted (tax/accounting and audit evidence): reported so someone can decide with legal advice. */
  async pastWindow(): Promise<PurgeResult['pastWindow']> {
    const now = this.clock.now().getTime();
    const financial = new Date(now - this.config.get('RETENTION_FINANCIAL_YEARS', { infer: true }) * YEAR_MS);
    const audit = new Date(now - this.config.get('RETENTION_AUDIT_YEARS', { infer: true }) * YEAR_MS);
    const [financialOrders, auditLogs] = await Promise.all([
      this.prisma.order.count({ where: { createdAt: { lt: financial } } }),
      this.prisma.auditLog.count({ where: { createdAt: { lt: audit } } }),
    ]);
    return { financialOrders, auditLogs };
  }

  private queueAssetDeletion(publicId: string) {
    const jobId = `del-${createHash('sha1').update(publicId).digest('hex')}`;
    return this.media.add(DELETE_MEDIA_ASSET_JOB, { publicId }, { jobId });
  }
}
