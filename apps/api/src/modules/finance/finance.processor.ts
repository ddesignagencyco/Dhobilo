import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUES } from '../../infra/queue/queues';
import { CodService } from './cod.service';
import { FinanceJob, SETTLE_ORDER_JOB } from './finance.jobs';
import { LedgerService } from './ledger.service';

@Processor(QUEUES.FINANCE)
export class FinanceProcessor extends WorkerHost {
  private readonly logger = new Logger(FinanceProcessor.name);

  constructor(
    private readonly ledger: LedgerService,
    private readonly cod: CodService,
  ) {
    super();
  }

  async process(job: Job<FinanceJob>): Promise<unknown> {
    switch (job.name) {
      case SETTLE_ORDER_JOB: {
        const orderId = job.data.orderId;
        // Prepaid orders are credited now. A cash order is only recorded as cash in the rider's hand: the vendor is
        // credited when the admin records the rider's deposit (see CodService.settle).
        const collected = await this.cod.recordForOrder(orderId);
        const earned = await this.ledger.postOrderEarnings(orderId);
        return { orderId, earned, collected };
      }
      default:
        this.logger.warn({ name: job.name }, 'Unknown finance job');
        return null;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<FinanceJob>, err: Error): void {
    this.logger.error({ err, name: job.name, jobId: job.id, data: job.data }, 'Finance job failed');
  }
}
