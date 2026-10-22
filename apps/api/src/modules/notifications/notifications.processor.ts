import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUES } from '../../infra/queue/queues';
import { SMS_PROVIDER } from '../../infra/sms/sms.provider';
import type { SmsProvider } from '../../infra/sms/sms.provider';

export const SEND_SMS_JOB = 'send-sms';

export interface SendSmsJob {
  to: string;
  message: string;
  requestId?: string;
}

/** Worker-side consumer of the `notifications` queue. WhatsApp/push/email handlers arrive with Phase 4. */
@Processor(QUEUES.NOTIFICATIONS)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(@Inject(SMS_PROVIDER) private readonly sms: SmsProvider) {
    super();
  }

  async process(job: Job<SendSmsJob>): Promise<void> {
    switch (job.name) {
      case SEND_SMS_JOB:
        await this.sms.send(job.data.to, job.data.message);
        return;
      default:
        this.logger.error({ jobName: job.name, requestId: job.data?.requestId }, 'No handler for job');
        throw new Error(`No handler for notifications job "${job.name}"`);
    }
  }
}
