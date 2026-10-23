import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { QUEUES } from '../../infra/queue/queues';
import { EarningsPosterService } from './earnings-poster.service';
import { POST_EARNINGS_JOB, PostEarningsData, SWEEP_EARNINGS_JOB } from './finance.scheduler';

export const SWEEP_EARNINGS_EVERY_MS = 5 * 60_000;

/** Worker side of the finance queue. */
@Processor(QUEUES.FINANCE)
@Injectable()
export class FinanceProcessor extends WorkerHost {
  constructor(private readonly poster: EarningsPosterService) {
    super();
  }

  async process(job: Job<PostEarningsData | undefined>): Promise<unknown> {
    switch (job.name) {
      case POST_EARNINGS_JOB:
        return { posted: await this.poster.postIfDue((job.data as PostEarningsData).orderId) };
      case SWEEP_EARNINGS_JOB:
        return { posted: await this.poster.sweep() };
      default:
        throw new Error(`No handler for finance job "${job.name}"`);
    }
  }
}

/** Worker only: registers the recurring sweeper. */
@Injectable()
export class FinanceBootstrap implements OnApplicationBootstrap {
  constructor(@InjectQueue(QUEUES.FINANCE) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(SWEEP_EARNINGS_JOB, { every: SWEEP_EARNINGS_EVERY_MS }, { name: SWEEP_EARNINGS_JOB, opts: { removeOnComplete: 10, removeOnFail: 100 } });
  }
}
