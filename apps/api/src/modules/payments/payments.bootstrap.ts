import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { Env } from '../../config/env';
import { QUEUES } from '../../infra/queue/queues';
import { PAYMENT_RECONCILE_JOB } from './payments.jobs';

/** Worker only: asks gateways about stale payments every few minutes. Idempotent across replicas. */
@Injectable()
export class PaymentsBootstrap implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(QUEUES.PAYMENTS) private readonly queue: Queue,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const seconds = this.config.get('PAYMENT_RECONCILE_INTERVAL_SEC', { infer: true });
    await this.queue.upsertJobScheduler(
      PAYMENT_RECONCILE_JOB,
      { every: seconds * 1000 },
      { name: PAYMENT_RECONCILE_JOB, opts: { removeOnComplete: 10, removeOnFail: 100 } },
    );
  }
}
