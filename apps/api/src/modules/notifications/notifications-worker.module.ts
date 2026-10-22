import { Module } from '@nestjs/common';
import { SmsModule } from '../../infra/sms/sms.module';
import { NotificationsProcessor } from './notifications.processor';

/** Imported by the worker process only; the API process just enqueues jobs. */
@Module({
  imports: [SmsModule],
  providers: [NotificationsProcessor],
})
export class NotificationsWorkerModule {}
