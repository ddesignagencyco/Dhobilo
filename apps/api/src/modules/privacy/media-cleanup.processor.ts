import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { CloudinaryService } from '../../infra/cloudinary/cloudinary.service';
import { QUEUES } from '../../infra/queue/queues';
import { DELETE_MEDIA_ASSET_JOB } from './privacy.constants';

/** Worker side of the `media` queue: removes files that belonged to a deleted account. */
@Processor(QUEUES.MEDIA)
export class MediaCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaCleanupProcessor.name);

  constructor(private readonly cloudinary: CloudinaryService) {
    super();
  }

  async process(job: Job<{ publicId: string }>): Promise<{ deleted: boolean }> {
    if (job.name !== DELETE_MEDIA_ASSET_JOB) throw new Error(`No handler for media job "${job.name}"`);
    const deleted = await this.cloudinary.deleteAsset(job.data.publicId);
    if (!deleted) this.logger.warn('Media storage is not configured; nothing to delete in this environment');
    return { deleted };
  }
}
