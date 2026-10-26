import { Module } from '@nestjs/common';
import { VendorsModule } from '../vendors/vendors.module';
import { AdminAnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { DayStatsService } from './day-stats.service';
import { VendorAnalyticsController } from './vendor-analytics.controller';
import { VendorAnalyticsService } from './vendor-analytics.service';

@Module({
  imports: [VendorsModule],
  controllers: [AdminAnalyticsController, VendorAnalyticsController],
  providers: [DayStatsService, AnalyticsService, VendorAnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
