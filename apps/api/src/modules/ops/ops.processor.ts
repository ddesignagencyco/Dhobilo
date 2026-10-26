import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { QUEUES } from '../../infra/queue/queues';
import { CHECK_QUEUES_EVERY_MS, CHECK_QUEUES_JOB, PURGE_OLD_DATA_CRON, PURGE_OLD_DATA_JOB } from './ops.jobs';
import { QueueHealthService } from './queue-health.service';
import { RetentionService } from './retention.service';

/** Worker side of the `maintenance` queue: the queue watch and the nightly retention clean-up. */
@Processor(QUEUES.MAINTENANCE)
export class OpsProcessor extends WorkerHost {
  private readonly logger = new Logger(OpsProcessor.name);

  constructor(
    private readonly queues: QueueHealthService,
    private readonly retention: RetentionService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case CHECK_QUEUES_JOB:
        return this.queues.check();
      case PURGE_OLD_DATA_JOB: {
        const purged = await this.retention.purge();
        this.logger.log(purged, 'Removed old operational records');
        return purged;
      }
      default:
        throw new Error(`No handler for maintenance job "${job.name}"`);
    }
  }
}

/** Worker only: registers both schedules. Idempotent, so every worker replica can run it at startup. */
@Injectable()
export class OpsBootstrap implements OnApplicationBootstrap {
  constructor(@InjectQueue(QUEUES.MAINTENANCE) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(CHECK_QUEUES_JOB, { every: CHECK_QUEUES_EVERY_MS }, { name: CHECK_QUEUES_JOB, opts: { removeOnComplete: 5, removeOnFail: 50 } });
    await this.queue.upsertJobScheduler(PURGE_OLD_DATA_JOB, { pattern: PURGE_OLD_DATA_CRON, tz: 'Asia/Karachi' }, { name: PURGE_OLD_DATA_JOB, opts: { removeOnComplete: 30, removeOnFail: 100 } });
  }
}
