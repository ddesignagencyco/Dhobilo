import { randomUUID } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { AnnouncementStatus, Locale, NotificationChannel, NotificationStatus, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { QUEUES } from '../../infra/queue/queues';
import { SEND_EMAIL_JOB, SEND_PUSH_JOB, SEND_SMS_JOB, SendEmailJob, SendPushJob, SendSmsJob } from '../notifications/notifications.jobs';
import { AudienceMember, AudienceService, Segment } from './audience.service';

export const FANOUT_ANNOUNCEMENT_JOB = 'fan-out-announcement';

export interface FanoutAnnouncementJob {
  announcementId: string;
}

/** Messages per second we allow ourselves to hand each provider (below their published limits). */
export const SEND_RATE_PER_SEC = { PUSH: 200, SMS: 20, EMAIL: 10 } as const;
type Channel = keyof typeof SEND_RATE_PER_SEC;

/** How long to hold back the n-th message of a channel so the channel never exceeds `perSecond`. */
export function staggerDelayMs(index: number, perSecond: number): number {
  return Math.floor(index / perSecond) * 1000;
}

const SELECT_BATCH = 500;

/**
 * Turns one announcement into per-person messages (FR-A7). Everything goes through the normal `notifications`
 * queue and each message gets its own `Notification` row, so delivery, retries and failures are tracked the same
 * way as order updates. Messages are spread over time (see SEND_RATE_PER_SEC) instead of being fired all at once.
 * Safe to run again after a crash: people who already have a row for this announcement are skipped.
 */
@Injectable()
export class AnnouncementFanoutService {
  private readonly logger = new Logger(AnnouncementFanoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audience: AudienceService,
    @InjectQueue(QUEUES.NOTIFICATIONS) private readonly queue: Queue,
  ) {}

  async run(announcementId: string): Promise<{ queued: number }> {
    const a = await this.prisma.announcement.findUnique({ where: { id: announcementId } });
    if (!a || a.status === AnnouncementStatus.SENT) return { queued: 0 };
    await this.prisma.announcement.update({ where: { id: a.id }, data: { status: AnnouncementStatus.SENDING, error: null } });

    const segment = a.segment as unknown as Segment;
    const channels = a.channels as readonly string[];
    const position: Record<Channel, number> = { PUSH: 0, SMS: 0, EMAIL: 0 };
    let people = 0;
    let queued = 0;
    try {
      for await (const batch of this.audience.members(segment, SELECT_BATCH)) {
        const done = await this.prisma.notification.findMany({
          where: { announcementId: a.id, userId: { in: batch.map((m) => m.id) } },
          select: { userId: true },
          distinct: ['userId'],
        });
        const skip = new Set(done.map((d) => d.userId));
        const fresh = batch.filter((m) => !skip.has(m.id));
        people += batch.length;
        queued += await this.queueBatch(a, fresh, channels, position);
      }
      await this.prisma.announcement.update({
        where: { id: a.id },
        data: { status: AnnouncementStatus.SENT, recipientCount: people, sentCount: await this.prisma.notification.count({ where: { announcementId: a.id } }), completedAt: new Date() },
      });
      return { queued };
    } catch (err) {
      await this.prisma.announcement.update({ where: { id: a.id }, data: { status: AnnouncementStatus.FAILED, error: String(err).slice(0, 500) } }).catch(() => undefined);
      this.logger.error({ err, announcementId: a.id }, 'Announcement fan-out failed');
      throw err;
    }
  }

  private text(a: { title: string; body: string; titleUr: string | null; bodyUr: string | null }, locale: Locale) {
    return locale === Locale.UR && a.titleUr && a.bodyUr ? { title: a.titleUr, body: a.bodyUr } : { title: a.title, body: a.body };
  }

  private async queueBatch(
    a: { id: string; title: string; body: string; titleUr: string | null; bodyUr: string | null },
    members: AudienceMember[],
    channels: readonly string[],
    position: Record<Channel, number>,
  ): Promise<number> {
    const rows: Prisma.NotificationCreateManyInput[] = [];
    const jobs: Array<{ name: string; data: object; opts: { delay: number } }> = [];
    for (const m of members) {
      const msg = this.text(a, m.locale);
      const payload = { title: msg.title, body: msg.body, data: { announcementId: a.id } } satisfies Prisma.InputJsonObject;
      for (const channel of this.audience.channelsFor(m, channels)) {
        const id = randomUUID();
        const delay = staggerDelayMs(position[channel]++, SEND_RATE_PER_SEC[channel]);
        rows.push({ id, userId: m.id, channel: NotificationChannel[channel], template: 'announcement', payload, status: NotificationStatus.QUEUED, announcementId: a.id });
        if (channel === 'PUSH') {
          jobs.push({ name: SEND_PUSH_JOB, opts: { delay }, data: { notificationId: id, tokens: m.deviceTokens.map((t) => t.token), title: msg.title, body: msg.body, data: { announcementId: a.id } } satisfies SendPushJob });
        } else if (channel === 'SMS') {
          jobs.push({ name: SEND_SMS_JOB, opts: { delay }, data: { notificationId: id, to: m.phone, message: `Dhoblio: ${msg.title}. ${msg.body}`.slice(0, 480) } satisfies SendSmsJob });
        } else {
          jobs.push({ name: SEND_EMAIL_JOB, opts: { delay }, data: { notificationId: id, to: m.email!, subject: msg.title, text: msg.body } satisfies SendEmailJob });
        }
      }
    }
    if (rows.length === 0) return 0;
    await this.prisma.notification.createMany({ data: rows });
    try {
      await this.queue.addBulk(jobs);
    } catch (err) {
      // Remove the rows again so a retry of the whole fan-out does not skip these people.
      await this.prisma.notification.deleteMany({ where: { id: { in: rows.map((r) => r.id!) } } });
      throw err;
    }
    return rows.length;
  }
}
