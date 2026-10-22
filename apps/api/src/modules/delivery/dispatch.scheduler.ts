import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUES } from '../../infra/queue/queues';

export const DISPATCH_JOB = 'dispatch-job';
export const OFFER_TIMEOUT_JOB = 'offer-timeout';
export const SWEEP_DISPATCH_JOB = 'sweep-dispatch';

export interface DispatchJobData {
  jobId: string;
}
export interface OfferTimeoutData {
  jobId: string;
  riderId: string;
}

/** Puts dispatch work on the queue. Never throws: the sweeper in the worker finds anything that slips through. */
@Injectable()
export class DispatchScheduler {
  private readonly logger = new Logger(DispatchScheduler.name);

  constructor(@InjectQueue(QUEUES.DISPATCH) private readonly queue: Queue) {}

  /**
   * Look for a rider for this job after `delayMs`. Handlers re-check the job's state, so a duplicate request is
   * harmless; the first request for a job uses a fixed id so creating the same job twice queues it once.
   */
  async dispatch(jobId: string, delayMs = 0, opts: { first?: boolean } = {}): Promise<void> {
    try {
      await this.queue.add(DISPATCH_JOB, { jobId } satisfies DispatchJobData, {
        delay: Math.max(delayMs, 0),
        removeOnComplete: true,
        removeOnFail: 1000,
        ...(opts.first ? { jobId: `dispatch-first-${jobId}` } : {}),
      });
    } catch (err) {
      this.logger.error({ err, jobId }, 'Could not queue dispatch');
    }
  }

  /** If the offered rider hasn't accepted by then, the offer lapses and the next rider is tried. */
  async offerTimeout(jobId: string, riderId: string, delayMs: number): Promise<void> {
    try {
      await this.queue.add(OFFER_TIMEOUT_JOB, { jobId, riderId } satisfies OfferTimeoutData, {
        delay: delayMs,
        jobId: `offer-timeout-${jobId}-${riderId}-${Date.now()}`,
        removeOnComplete: true,
        removeOnFail: 1000,
      });
    } catch (err) {
      this.logger.error({ err, jobId, riderId }, 'Could not queue the offer timeout');
    }
  }
}
