import { Module } from '@nestjs/common';
import { OrderLifecycleModule } from '../lifecycle/order-lifecycle.module';
import { OrderTimersProcessor } from './order-timers.processor';

/** The queue consumer. The worker imports this (plus the sweeper bootstrap); tests import it to drive timers directly. */
@Module({
  imports: [OrderLifecycleModule],
  providers: [OrderTimersProcessor],
  exports: [OrderTimersProcessor],
})
export class OrderTimersModule {}
