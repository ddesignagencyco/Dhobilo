import { Module } from '@nestjs/common';
import { AnnouncementsCoreModule } from './announcements-core.module';
import { AdminAnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';

@Module({
  imports: [AnnouncementsCoreModule],
  controllers: [AdminAnnouncementsController],
  providers: [AnnouncementsService],
})
export class AnnouncementsModule {}
