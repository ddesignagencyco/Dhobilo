import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { QUEUES } from '../../infra/queue/queues';
import { addDays } from '../../common/time/zoned';
import { AnalyticsService } from './analytics.service';
import { ROLLUP_DAILY_CRON, ROLLUP_DAILY_JOB, RollupDailyJob } from './analytics.jobs';

/** Worker side of the `analytics` queue (TRD §9). Recomputing a day is idempotent, so retries and repeats are harmless. */
@Processor(QUEUES.ANALYTICS)
export class AnalyticsProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalyticsProcessor.name);

  constructor(private readonly analytics: AnalyticsService) {
    super();
  }

  async process(job: Job<RollupDailyJob>): Promise<{ days: string[] }> {
    if (job.name !== ROLLUP_DAILY_JOB) throw new Error(`No handler for analytics job "${job.name}"`);
    const days = job.data?.days?.length ? job.data.days : [addDays(this.analytics.today(), -1)];
    for (const day of days) {
      const done = await this.analytics.rollupDay(day);
      this.logger.log(done, 'Rolled up a day');
    }
    return { days };
  }
}

/** Worker only: registers the nightly rollup. Idempotent, so every worker replica can run it at startup. */
@Injectable()
export class AnalyticsBootstrap implements OnApplicationBootstrap {
  constructor(@InjectQueue(QUEUES.ANALYTICS) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      ROLLUP_DAILY_JOB,
      { pattern: ROLLUP_DAILY_CRON, tz: 'Asia/Karachi' },
      { name: ROLLUP_DAILY_JOB, data: {}, opts: { removeOnComplete: 30, removeOnFail: 100 } },
    );
  }
}
