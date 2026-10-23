import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUES } from '../../infra/queue/queues';

export const PROCESS_EVENT_JOB = 'process-payment-event';
export const REFUND_JOB = 'refund-payment';
export const SWEEP_PAYMENTS_JOB = 'sweep-payments';

export interface ProcessEventData {
  eventId: string;
}
export interface RefundData {
  paymentId: string;
  reason: string;
}

/** Puts payment work on the queue. Never throws: the worker's sweeper finds anything that slips through. */
@Injectable()
export class PaymentsScheduler {
  private readonly logger = new Logger(PaymentsScheduler.name);

  constructor(@InjectQueue(QUEUES.PAYMENTS) private readonly queue: Queue) {}

  async processEvent(eventId: string): Promise<void> {
    try {
      // A fixed id: the same notification is queued once.
      await this.queue.add(PROCESS_EVENT_JOB, { eventId } satisfies ProcessEventData, { jobId: `payment-event-${eventId}`, removeOnComplete: true, removeOnFail: 1000 });
    } catch (err) {
      this.logger.error({ err, eventId }, 'Could not queue a payment notification');
    }
  }

  async refund(paymentId: string, reason: string): Promise<void> {
    try {
      await this.queue.add(REFUND_JOB, { paymentId, reason } satisfies RefundData, { jobId: `payment-refund-${paymentId}`, removeOnComplete: true, removeOnFail: 1000 });
    } catch (err) {
      this.logger.error({ err, paymentId }, 'Could not queue a refund');
    }
  }
}
