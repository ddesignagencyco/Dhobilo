import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MailService } from '../../infra/mail/mail.service';
import { QUEUES } from '../../infra/queue/queues';
import { SMS_PROVIDER } from '../../infra/sms/sms.provider';
import type { SmsProvider } from '../../infra/sms/sms.provider';

export const SEND_SMS_JOB = 'send-sms';
export const SEND_EMAIL_JOB = 'send-email';

export interface SendSmsJob {
  to: string;
  message: string;
  requestId?: string;
}

export interface SendEmailJob {
  to: string;
  subject: string;
  text: string;
  requestId?: string;
}

/** Worker-side consumer of the `notifications` queue. WhatsApp and push handlers arrive with Phase 4. */
@Processor(QUEUES.NOTIFICATIONS)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    private readonly mail: MailService,
  ) {
    super();
  }

  async process(job: Job<SendSmsJob | SendEmailJob>): Promise<void> {
    switch (job.name) {
      case SEND_SMS_JOB: {
        const data = job.data as SendSmsJob;
        await this.sms.send(data.to, data.message);
        return;
      }
      case SEND_EMAIL_JOB: {
        const data = job.data as SendEmailJob;
        await this.mail.send({ to: data.to, subject: data.subject, text: data.text });
        return;
      }
      default:
        this.logger.error({ jobName: job.name, requestId: job.data?.requestId }, 'No handler for job');
        throw new Error(`No handler for notifications job "${job.name}"`);
    }
  }
}
