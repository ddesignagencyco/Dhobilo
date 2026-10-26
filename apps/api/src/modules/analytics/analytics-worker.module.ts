import { Module } from '@nestjs/common';
import { DayStatsService } from './day-stats.service';
import { AnalyticsService } from './analytics.service';
import { AnalyticsBootstrap, AnalyticsProcessor } from './analytics.processor';

/** Worker side: the nightly rollup. No HTTP controllers here (the API process serves them). */
@Module({ providers: [DayStatsService, AnalyticsService, AnalyticsProcessor, AnalyticsBootstrap] })
export class AnalyticsWorkerModule {}
