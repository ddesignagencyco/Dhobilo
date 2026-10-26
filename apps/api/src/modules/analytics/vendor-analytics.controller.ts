import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, VendorStatus } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentVendor, RequireVendorStatus } from '../vendors/vendor-context';
import type { VendorContext } from '../vendors/vendor-context';
import { VendorContextGuard } from '../vendors/vendor-context.guard';
import { VendorAnalyticsQueryDto } from './analytics.dto';
import { VendorAnalyticsService } from './vendor-analytics.service';

@ApiTags('vendor-analytics')
@ApiBearerAuth()
@RequireVendorStatus(VendorStatus.APPROVED)
@UseGuards(VendorContextGuard)
@Controller('vendor/analytics')
export class VendorAnalyticsController {
  constructor(private readonly analytics: VendorAnalyticsService) {}

  /** The shop's own orders and earnings: today, the last 7 / 30 / 90 days, what is in progress, best sellers, rating trend. */
  @Get()
  @Roles(Role.VENDOR_OWNER, Role.VENDOR_STAFF)
  summary(@CurrentVendor() vendor: VendorContext, @Query() q: VendorAnalyticsQueryDto) {
    return this.analytics.summary(vendor.id, q.days);
  }
}
