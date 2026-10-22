import { Module } from '@nestjs/common';
import { DiscoveryCache } from './discovery.cache';
import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';

@Module({
  controllers: [DiscoveryController],
  providers: [DiscoveryService, DiscoveryCache],
  exports: [DiscoveryService],
})
export class DiscoveryModule {}
