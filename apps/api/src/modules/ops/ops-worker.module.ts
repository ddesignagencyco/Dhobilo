import { Module } from '@nestjs/common';
import { DeliveryCoreModule } from '../delivery/delivery-core.module';
import { OpsBootstrap, OpsProcessor } from './ops.processor';
import { QueueHealthService } from './queue-health.service';
import { RetentionService } from './retention.service';

@Module({ imports: [DeliveryCoreModule], providers: [QueueHealthService, RetentionService, OpsProcessor, OpsBootstrap] })
export class OpsWorkerModule {}
