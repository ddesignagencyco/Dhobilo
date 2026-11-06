import { Module } from '@nestjs/common';
import { MediaCleanupProcessor } from './media-cleanup.processor';

/** Worker only. */
@Module({ providers: [MediaCleanupProcessor] })
export class PrivacyWorkerModule {}
