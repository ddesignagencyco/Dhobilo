import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationStatus } from '@prisma/client';
import { Clock } from '../../common/time/clock';
import type { Env } from '../../config/env';
import { PrismaService } from '../../infra/prisma/prisma.service';

const DAY_MS = 86_400_000;

export interface PurgeResult {
  otpCodes: number;
  sessions: number;
  notifications: number;
  courierEvents: number;
}

/**
 * Retention policy (BE-9.5, data minimisation): operational records that only matter for a short time are deleted
 * on a schedule. Records the business or the law needs (orders, payments, the ledger, the audit log, complaints,
 * reviews) are never touched here.
 *
 * - login codes: RETENTION_OTP_DAYS after they were issued
 * - sessions: RETENTION_SESSION_DAYS after they expired or were revoked
 * - notification log (message text, phone-related): RETENTION_NOTIFICATION_DAYS, once delivered or failed
 * - courier webhook payloads: RETENTION_WEBHOOK_EVENT_DAYS
 */
@Injectable()
export class RetentionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private cutoff(days: number): Date {
    return new Date(this.clock.now().getTime() - days * DAY_MS);
  }

  async purge(): Promise<PurgeResult> {
    const days = (key: 'RETENTION_OTP_DAYS' | 'RETENTION_SESSION_DAYS' | 'RETENTION_NOTIFICATION_DAYS' | 'RETENTION_WEBHOOK_EVENT_DAYS') =>
      this.cutoff(this.config.get(key, { infer: true }));
    const sessionCutoff = days('RETENTION_SESSION_DAYS');
    const [otp, sessions, notifications, events] = await Promise.all([
      this.prisma.otpCode.deleteMany({ where: { createdAt: { lt: days('RETENTION_OTP_DAYS') } } }),
      this.prisma.session.deleteMany({ where: { OR: [{ expiresAt: { lt: sessionCutoff } }, { revokedAt: { lt: sessionCutoff } }] } }),
      this.prisma.notification.deleteMany({
        where: { createdAt: { lt: days('RETENTION_NOTIFICATION_DAYS') }, status: { in: [NotificationStatus.SENT, NotificationStatus.FAILED] } },
      }),
      this.prisma.courierWebhookEvent.deleteMany({ where: { createdAt: { lt: days('RETENTION_WEBHOOK_EVENT_DAYS') } } }),
    ]);
    return { otpCodes: otp.count, sessions: sessions.count, notifications: notifications.count, courierEvents: events.count };
  }
}
