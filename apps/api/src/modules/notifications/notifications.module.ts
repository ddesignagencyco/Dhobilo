import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

/** API-side: enqueues notification jobs. The worker consumes them (NotificationsWorkerModule). */
@Global()
@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
