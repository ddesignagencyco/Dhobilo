import { Module } from '@nestjs/common';
import { OrderEventsPublisher } from './order-events.publisher';
import { OrderLifecycleService } from './order-lifecycle.service';

/** The state machine and its Redis publisher. Imported by both the API and the worker (timers run there). */
@Module({
  providers: [OrderLifecycleService, OrderEventsPublisher],
  exports: [OrderLifecycleService],
})
export class OrderLifecycleModule {}
