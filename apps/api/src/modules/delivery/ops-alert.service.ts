import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { Env } from '../../config/env';
import { QUEUES } from '../../infra/queue/queues';
import { SEND_EMAIL_JOB, SendEmailJob } from '../notifications/notifications.jobs';

/** Tells the operations team something needs a human (a job nobody could take, a courier failure). Never throws. */
@Injectable()
export class OpsAlertService {
  private readonly logger = new Logger(OpsAlertService.name);

  constructor(
    @InjectQueue(QUEUES.NOTIFICATIONS) private readonly queue: Queue,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async alert(subject: string, text: string, context: Record<string, unknown> = {}): Promise<void> {
    // Always in the logs (where log alerts pick it up); also by email when an address is configured.
    this.logger.error({ ...context, ops: true }, `OPS ALERT: ${subject}. ${text}`);
    const to = this.config.get('OPS_ALERT_EMAIL', { infer: true });
    if (!to) return;
    try {
      await this.queue.add(SEND_EMAIL_JOB, { to, subject: `[Dhoblio ops] ${subject}`, text } satisfies SendEmailJob);
    } catch (err) {
      this.logger.error({ err }, 'Could not queue the ops alert email');
    }
  }
}
