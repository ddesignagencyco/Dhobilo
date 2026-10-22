import { Module } from '@nestjs/common';
import { PushModule } from '../../infra/push/push.module';
import { SmsModule } from '../../infra/sms/sms.module';
import { WhatsAppModule } from '../../infra/whatsapp/whatsapp.module';
import { NotificationsProcessor } from './notifications.processor';

/** Imported by the worker process only; the API process just enqueues jobs. */
@Module({
  imports: [SmsModule, WhatsAppModule, PushModule],
  providers: [NotificationsProcessor],
})
export class NotificationsWorkerModule {}
