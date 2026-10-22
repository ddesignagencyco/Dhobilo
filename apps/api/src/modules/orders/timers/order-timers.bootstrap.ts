import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUES } from '../../../infra/queue/queues';
import { SWEEP_OVERDUE_JOB } from './order-timers.processor';

export const SWEEP_EVERY_MS = 60_000;

/** Worker only: registers the recurring sweeper. Idempotent, so every worker replica can run it at startup. */
@Injectable()
export class OrderTimersBootstrap implements OnApplicationBootstrap {
  constructor(@InjectQueue(QUEUES.ORDER_TIMERS) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      SWEEP_OVERDUE_JOB,
      { every: SWEEP_EVERY_MS },
      { name: SWEEP_OVERDUE_JOB, opts: { removeOnComplete: 10, removeOnFail: 100 } },
    );
  }
}
