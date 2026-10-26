import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Queue } from 'bullmq';
import { Roles } from '../../common/decorators/roles.decorator';
import { addDays } from '../../common/time/zoned';
import { QUEUES } from '../../infra/queue/queues';
import { ROLLUP_DAILY_JOB, RollupDailyJob } from './analytics.jobs';
import { AnalyticsQueryDto, RollupDto, TopVendorsQueryDto } from './analytics.dto';
import { AnalyticsService } from './analytics.service';

@ApiTags('admin-analytics')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    @InjectQueue(QUEUES.ANALYTICS) private readonly queue: Queue,
  ) {}

  @Get('overview')
  overview(@Query() q: AnalyticsQueryDto) {
    return this.analytics.overview(q);
  }

  @Get('orders')
  orders(@Query() q: AnalyticsQueryDto) {
    return this.analytics.orders(q);
  }

  @Get('revenue')
  revenue(@Query() q: AnalyticsQueryDto) {
    return this.analytics.revenue(q);
  }

  @Get('vendors')
  vendors(@Query() q: TopVendorsQueryDto) {
    return this.analytics.topVendors(q);
  }

  /** Recomputes the stored daily numbers for a range of finished days (backfill, or after correcting data). */
  @Post('rollup')
  @HttpCode(202)
  async rollup(@Body() dto: RollupDto) {
    const today = this.analytics.today();
    const from = dto.from ?? addDays(today, -1);
    const range = this.analytics.range({ from, to: dto.to ?? from }, 1);
    const days = range.days.filter((d) => d < today);
    await this.queue.add(ROLLUP_DAILY_JOB, { days } satisfies RollupDailyJob);
    return { queued: days };
  }
}
