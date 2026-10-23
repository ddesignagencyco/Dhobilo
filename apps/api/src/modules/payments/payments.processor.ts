import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { QUEUES } from '../../infra/queue/queues';
import { PROCESS_EVENT_JOB, ProcessEventData, REFUND_JOB, RefundData, SWEEP_PAYMENTS_JOB } from './payments.scheduler';
import { PaymentsService } from './payments.service';

export const SWEEP_PAYMENTS_EVERY_MS = 60_000;

/** Worker side of the payments queue (TRD §9, §13.2). Every handler is idempotent, so a repeated job changes nothing. */
@Processor(QUEUES.PAYMENTS)
@Injectable()
export class PaymentsProcessor extends WorkerHost {
  constructor(private readonly payments: PaymentsService) {
    super();
  }

  async process(job: Job<ProcessEventData | RefundData | undefined>): Promise<unknown> {
    switch (job.name) {
      case PROCESS_EVENT_JOB:
        return { outcome: await this.payments.processEvent((job.data as ProcessEventData).eventId) };
      case REFUND_JOB: {
        const { paymentId, reason } = job.data as RefundData;
        await this.payments.refundQuietly(paymentId, reason);
        return { refunded: true };
      }
      case SWEEP_PAYMENTS_JOB:
        return this.payments.sweep();
      default:
        throw new Error(`No handler for payments job "${job.name}"`);
    }
  }
}

/** Worker only: registers the recurring sweeper (stranded notifications, reconciliation, unpaid-order timeouts). */
@Injectable()
export class PaymentsBootstrap implements OnApplicationBootstrap {
  constructor(@InjectQueue(QUEUES.PAYMENTS) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(SWEEP_PAYMENTS_JOB, { every: SWEEP_PAYMENTS_EVERY_MS }, { name: SWEEP_PAYMENTS_JOB, opts: { removeOnComplete: 10, removeOnFail: 100 } });
  }
}
