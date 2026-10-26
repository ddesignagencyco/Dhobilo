import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { NotificationChannel, NotificationStatus, Prisma } from '@prisma/client';
import { Job, Queue, UnrecoverableError } from 'bullmq';
import { MailService } from '../../infra/mail/mail.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PUSH_PROVIDER } from '../../infra/push/push.provider';
import type { PushProvider } from '../../infra/push/push.provider';
import { QUEUES } from '../../infra/queue/queues';
import { SMS_PROVIDER } from '../../infra/sms/sms.provider';
import type { SmsProvider } from '../../infra/sms/sms.provider';
import { WHATSAPP_PROVIDER } from '../../infra/whatsapp/whatsapp.provider';
import { AnnouncementFanoutService, FANOUT_ANNOUNCEMENT_JOB, FanoutAnnouncementJob } from '../announcements/announcement-fanout.service';
import type { WhatsAppProvider } from '../../infra/whatsapp/whatsapp.provider';
import { SEND_EMAIL_JOB, SEND_PUSH_JOB, SEND_SMS_JOB, SEND_WHATSAPP_JOB, SendEmailJob, SendPushJob, SendSmsJob, SendWhatsAppJob } from './notifications.jobs';

// Existing imports of the job names keep working.
export * from './notifications.jobs';

type AnyJob = SendSmsJob | SendEmailJob | SendWhatsAppJob | SendPushJob;

/**
 * Worker-side consumer of the `notifications` queue. Retries come from the queue (5 attempts, exponential);
 * each job also keeps its `Notification` row current (QUEUED -> SENT / FAILED, attempts, last error).
 */
@Processor(QUEUES.NOTIFICATIONS)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    private readonly mail: MailService,
    @Inject(WHATSAPP_PROVIDER) private readonly whatsapp: WhatsAppProvider,
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUES.NOTIFICATIONS) private readonly queue: Queue,
    private readonly announcements: AnnouncementFanoutService,
  ) {
    super();
  }

  async process(job: Job<AnyJob | FanoutAnnouncementJob>): Promise<void> {
    // An admin announcement is not a message itself: it expands into one message per person (and has no log row).
    if (job.name === FANOUT_ANNOUNCEMENT_JOB) {
      await this.announcements.run((job.data as FanoutAnnouncementJob).announcementId);
      return;
    }
    return this.deliver(job as Job<AnyJob>);
  }

  private async deliver(job: Job<AnyJob>): Promise<void> {
    const attempt = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts ?? 1;
    try {
      await this.handle(job);
      await this.record(job.data.notificationId, { status: NotificationStatus.SENT, attempts: attempt, error: null, sentAt: new Date() });
    } catch (err) {
      const final = err instanceof UnrecoverableError || attempt >= maxAttempts;
      await this.record(job.data.notificationId, {
        status: final ? NotificationStatus.FAILED : NotificationStatus.QUEUED,
        attempts: attempt,
        error: (err as Error).message.slice(0, 500),
      });
      if (final && job.name === SEND_WHATSAPP_JOB) await this.fallBackToSms(job as Job<SendWhatsAppJob>);
      throw err;
    }
  }

  private async handle(job: Job<AnyJob>): Promise<void> {
    switch (job.name) {
      case SEND_SMS_JOB: {
        const d = job.data as SendSmsJob;
        return this.sms.send(d.to, d.message);
      }
      case SEND_EMAIL_JOB: {
        const d = job.data as SendEmailJob;
        await this.mail.send({ to: d.to, subject: d.subject, text: d.text });
        return;
      }
      case SEND_WHATSAPP_JOB: {
        const d = job.data as SendWhatsAppJob;
        return this.whatsapp.send({ to: d.to, templateName: d.templateName, language: d.language, params: d.params, fallbackText: d.fallbackText });
      }
      case SEND_PUSH_JOB:
        return this.sendPush(job.data as SendPushJob);
      default:
        this.logger.error({ jobName: job.name }, 'No handler for job');
        throw new UnrecoverableError(`No handler for notifications job "${job.name}"`);
    }
  }

  /**
   * Sends to every device. Dead tokens (uninstalled app, rotated token) are deleted right away (TRD §14); a job
   * counts as delivered if any device got it, and is retried only for transient errors.
   */
  private async sendPush(d: SendPushJob): Promise<void> {
    const outcomes = await Promise.allSettled(d.tokens.map((t) => this.push.send(t, { title: d.title, body: d.body, data: d.data })));
    const dead: string[] = [];
    let delivered = 0;
    let transient: unknown;
    outcomes.forEach((o, i) => {
      if (o.status === 'rejected') transient ??= o.reason;
      else if (o.value.ok) delivered++;
      else if (o.value.invalidToken) dead.push(d.tokens[i]);
    });
    if (dead.length) await this.prisma.deviceToken.deleteMany({ where: { token: { in: dead } } });
    if (delivered > 0) return;
    if (transient) throw transient;
    throw new UnrecoverableError('All device tokens are invalid');
  }

  private async fallBackToSms(job: Job<SendWhatsAppJob>): Promise<void> {
    const d = job.data;
    if (!d.fallbackSms || !d.userId) return;
    try {
      const row = await this.prisma.notification.create({
        data: { userId: d.userId, channel: NotificationChannel.SMS, template: 'whatsapp_fallback', payload: { body: d.fallbackText }, status: NotificationStatus.QUEUED },
        select: { id: true },
      });
      await this.queue.add(SEND_SMS_JOB, { notificationId: row.id, to: d.to, message: d.fallbackText, requestId: d.requestId } satisfies SendSmsJob);
    } catch (err) {
      this.logger.error({ err, userId: d.userId }, 'Could not queue the SMS fallback');
    }
  }

  private async record(id: string | undefined, data: Prisma.NotificationUpdateInput): Promise<void> {
    if (!id) return; // e.g. OTP SMS: not part of the user's notification log
    try {
      await this.prisma.notification.update({ where: { id }, data });
    } catch (err) {
      this.logger.warn({ err, notificationId: id }, 'Could not update the notification log');
    }
  }
}
