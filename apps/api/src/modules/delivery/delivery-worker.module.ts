import { Module } from '@nestjs/common';
import { DeliveryCoreModule } from './delivery-core.module';
import { DispatchBootstrap, DispatchProcessor } from './dispatch.processor';

/** The queue consumer. The worker imports this (plus the sweeper bootstrap); tests import it to drive dispatch directly. */
@Module({
  imports: [DeliveryCoreModule],
  providers: [DispatchProcessor],
  exports: [DispatchProcessor],
})
export class DeliveryWorkerModule {}

export { DispatchBootstrap };
