import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, VendorStatus } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { EarningsQueryDto, RequestPayoutDto } from './dto/finance.dto';
import { EarningsService } from './earnings.service';
import { LedgerService } from './ledger.service';
import { PayoutsService } from './payouts.service';
import { CurrentVendor, RequireVendorStatus } from '../vendors/vendor-context';
import type { VendorContext } from '../vendors/vendor-context';
import { VendorContextGuard } from '../vendors/vendor-context.guard';

@ApiTags('vendor-finance')
@ApiBearerAuth()
@RequireVendorStatus(VendorStatus.APPROVED)
@UseGuards(VendorContextGuard)
@Controller('vendor')
export class VendorFinanceController {
  constructor(
    private readonly earnings: EarningsService,
    private readonly payouts: PayoutsService,
    private readonly ledger: LedgerService,
  ) {}

  /** Delivered-order earnings for a day, week (default) or month, plus the ledger balance. */
  @Get('earnings')
  @Roles(Role.VENDOR_OWNER, Role.VENDOR_STAFF)
  summary(@CurrentVendor() vendor: VendorContext, @Query() q: EarningsQueryDto) {
    return this.earnings.vendorSummary(vendor.id, q);
  }

  /** Signed ledger movements, newest first. */
  @Get('ledger')
  @Roles(Role.VENDOR_OWNER, Role.VENDOR_STAFF)
  listLedger(@CurrentVendor() vendor: VendorContext) {
    return this.ledger.list(vendor.id);
  }

  @Get('payouts')
  @Roles(Role.VENDOR_OWNER, Role.VENDOR_STAFF)
  listPayouts(@CurrentVendor() vendor: VendorContext) {
    return this.payouts.listMine(vendor.id);
  }

  /** Ask to withdraw part of the available balance. */
  @Post('payouts')
  @Roles(Role.VENDOR_OWNER)
  request(@CurrentVendor() vendor: VendorContext, @Body() dto: RequestPayoutDto) {
    return this.payouts.request(vendor.id, dto);
  }
}
