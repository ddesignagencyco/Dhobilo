import { Module } from '@nestjs/common';
import { PaymentsModule } from './payments.module';
import { PaymentsBootstrap } from './payments.bootstrap';
import { PaymentsProcessor } from './payments.processor';

@Module({
  imports: [PaymentsModule],
  providers: [PaymentsProcessor, PaymentsBootstrap],
})
export class PaymentsWorkerModule {}
