import { Module } from '@nestjs/common';
import { AnnouncementFanoutService } from './announcement-fanout.service';
import { AudienceService } from './audience.service';

/** The audience rules and the fan-out, used by the API (to preview and queue) and the worker (to send). */
@Module({ providers: [AudienceService, AnnouncementFanoutService], exports: [AudienceService, AnnouncementFanoutService] })
export class AnnouncementsCoreModule {}
