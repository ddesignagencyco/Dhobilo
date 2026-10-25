import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUES } from '../../infra/queue/queues';
import { PaymentsService } from './payments.service';
import {
  PAYMENT_RECONCILE_JOB,
  PAYMENT_WEBHOOK_JOB,
  PaymentWebhookJob,
  REFUND_ORDER_JOB,
  RefundOrderJob,
} from './payments.jobs';

export type PaymentJob = PaymentWebhookJob | RefundOrderJob | Record<string, never>;

@Processor(QUEUES.PAYMENTS)
export class PaymentsProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentsProcessor.name);

  constructor(private readonly payments: PaymentsService) {
    super();
  }

  async process(job: Job<PaymentJob>): Promise<unknown> {
    switch (job.name) {
      case PAYMENT_WEBHOOK_JOB:
        return this.payments.applyEvent((job.data as PaymentWebhookJob).event);
      case PAYMENT_RECONCILE_JOB:
        return this.payments.reconcile();
      case REFUND_ORDER_JOB: {
        const data = job.data as RefundOrderJob;
        return this.payments.refundOrder(data.orderId, data.reason);
      }
      default:
        this.logger.warn({ name: job.name }, 'Unknown payments job');
        return null;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<PaymentJob>, err: Error): void {
    this.logger.error({ err, name: job.name, jobId: job.id, attempts: job.attemptsMade }, 'Payments job failed');
  }
}
