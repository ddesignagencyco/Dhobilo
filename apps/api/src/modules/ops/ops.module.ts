import { Module } from '@nestjs/common';
import { DeliveryCoreModule } from '../delivery/delivery-core.module';
import { AdminQueuesController } from './admin-queues.controller';
import { QueueHealthService } from './queue-health.service';
import { RetentionService } from './retention.service';

@Module({
  imports: [DeliveryCoreModule],
  controllers: [AdminQueuesController],
  providers: [QueueHealthService, RetentionService],
})
export class OpsModule {}
