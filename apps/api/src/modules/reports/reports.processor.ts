import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { QUEUES } from '../../infra/queue/queues';
import { GENERATE_REPORT_JOB, GenerateReportJob, PURGE_REPORTS_EVERY_MS, PURGE_REPORTS_JOB } from './reports.jobs';
import { ReportsService } from './reports.service';

/** Worker side of the `exports` queue (TRD §9). */
@Processor(QUEUES.EXPORTS)
export class ReportsProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportsProcessor.name);

  constructor(private readonly reports: ReportsService) {
    super();
  }

  async process(job: Job<GenerateReportJob>): Promise<unknown> {
    switch (job.name) {
      case GENERATE_REPORT_JOB: {
        const final = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
        await this.reports.generate(job.data.reportId, final);
        return { reportId: job.data.reportId };
      }
      case PURGE_REPORTS_JOB: {
        const purged = await this.reports.purgeExpired();
        if (purged > 0) this.logger.log({ purged }, 'Removed expired report files');
        return { purged };
      }
      default:
        throw new Error(`No handler for exports job "${job.name}"`);
    }
  }
}

/** Worker only: registers the hourly clean-up of expired files. Idempotent across replicas. */
@Injectable()
export class ReportsBootstrap implements OnApplicationBootstrap {
  constructor(@InjectQueue(QUEUES.EXPORTS) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      PURGE_REPORTS_JOB,
      { every: PURGE_REPORTS_EVERY_MS },
      { name: PURGE_REPORTS_JOB, opts: { removeOnComplete: 10, removeOnFail: 100 } },
    );
  }
}
