import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { QUEUES } from '../../infra/queue/queues';
import { DISPATCH_JOB, DispatchJobData, OFFER_TIMEOUT_JOB, OfferTimeoutData, SWEEP_DISPATCH_JOB } from './dispatch.scheduler';
import { DispatchService } from './dispatch.service';

export const SWEEP_DISPATCH_EVERY_MS = 60_000;

/** Worker side of the dispatch queue (TRD §9). Every handler checks the job's current state, so repeats are harmless. */
@Processor(QUEUES.DISPATCH)
@Injectable()
export class DispatchProcessor extends WorkerHost {
  constructor(private readonly dispatch: DispatchService) {
    super();
  }

  async process(job: Job<DispatchJobData | OfferTimeoutData | undefined>): Promise<unknown> {
    switch (job.name) {
      case DISPATCH_JOB:
        return { outcome: await this.dispatch.dispatch((job.data as DispatchJobData).jobId) };
      case OFFER_TIMEOUT_JOB: {
        const { jobId, riderId } = job.data as OfferTimeoutData;
        return { lapsed: await this.dispatch.offerTimedOut(jobId, riderId) };
      }
      case SWEEP_DISPATCH_JOB:
        return this.dispatch.sweep();
      default:
        throw new Error(`No handler for dispatch job "${job.name}"`);
    }
  }
}

/** Worker only: registers the recurring sweeper. Idempotent, so every worker replica can run it at startup. */
@Injectable()
export class DispatchBootstrap implements OnApplicationBootstrap {
  constructor(@InjectQueue(QUEUES.DISPATCH) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      SWEEP_DISPATCH_JOB,
      { every: SWEEP_DISPATCH_EVERY_MS },
      { name: SWEEP_DISPATCH_JOB, opts: { removeOnComplete: 10, removeOnFail: 100 } },
    );
  }
}
