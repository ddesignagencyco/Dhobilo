import { Module } from '@nestjs/common';
import { PaymentsCoreModule } from './payments-core.module';
import { PaymentsBootstrap, PaymentsProcessor } from './payments.processor';

/** The queue consumer. The worker imports this (plus the sweeper bootstrap); tests import the core module to drive payments directly. */
@Module({ imports: [PaymentsCoreModule], providers: [PaymentsProcessor], exports: [PaymentsProcessor] })
export class PaymentsWorkerModule {}

export { PaymentsBootstrap };
