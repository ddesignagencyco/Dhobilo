import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, VendorStatus } from '@prisma/client';
import type { AuthUser, AuthedRequest } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Paged } from '../../common/interceptors/response-envelope.interceptor';
import { CurrentRider, RequireRiderStatus } from '../delivery/rider-context';
import type { RiderContext } from '../delivery/rider-context';
import { RiderContextGuard } from '../delivery/rider-context.guard';
import { CurrentVendor, RequireVendorStatus } from '../vendors/vendor-context';
import type { VendorContext } from '../vendors/vendor-context';
import { VendorContextGuard } from '../vendors/vendor-context.guard';
import { CodService } from './cod.service';
import { CommissionAdminService } from './commission-admin.service';
import {
  CreateCommissionRuleDto,
  EarningsLinesQueryDto,
  EarningsSummaryQueryDto,
  LedgerAdjustmentDto,
  LedgerQueryDto,
  ListCommissionRulesQueryDto,
  ListPayoutsQueryDto,
  ListSettlementsQueryDto,
  PayPayoutDto,
  PayoutsPageQueryDto,
  RejectPayoutDto,
  RequestPayoutDto,
  SettleCodDto,
} from './dto/finance.dto';
import { EarningsService } from './earnings.service';
import { PayoutsService } from './payouts.service';

/** The vendor's money: what they earned, what they can withdraw, and withdrawal requests. Owners only. */
@ApiTags('vendor-finance')
@ApiBearerAuth()
@Roles(Role.VENDOR_OWNER)
@UseGuards(VendorContextGuard)
@RequireVendorStatus(VendorStatus.APPROVED, VendorStatus.SUSPENDED)
@Controller('vendor')
export class VendorFinanceController {
  constructor(
    private readonly earnings: EarningsService,
    private readonly payouts: PayoutsService,
  ) {}

  /** Totals for a day, week (Mon-Sun) or month: earned, commission taken, refunds, net, and a row per day. */
  @Get('earnings')
  summary(@CurrentVendor() vendor: VendorContext, @Query() q: EarningsSummaryQueryDto) {
    return this.earnings.summary(vendor.id, q.period, q.date);
  }

  /** One line per order that earned money, newest first. */
  @Get('earnings/orders')
  async lines(@CurrentVendor() vendor: VendorContext, @Query() q: EarningsLinesQueryDto) {
    const { items, nextCursor } = await this.earnings.lines(vendor.id, q);
    return new Paged(items, { nextCursor });
  }

  /** Balance, how much can be withdrawn now, open requests, paid out, and cash orders waiting on the rider. */
  @Get('balance')
  balance(@CurrentVendor() vendor: VendorContext) {
    return this.earnings.balance(vendor.id);
  }

  /** Ask to withdraw. The amount is set aside straight away; an admin approves and pays it. */
  @Post('payouts')
  @RequireVendorStatus(VendorStatus.APPROVED)
  request(@CurrentVendor() vendor: VendorContext, @CurrentUser() user: AuthUser, @Body() dto: RequestPayoutDto) {
    return this.payouts.request(vendor.id, user.id, dto);
  }

  /** Your withdrawal requests, newest first. The account is always shown masked. */
  @Get('payouts')
  async list(@CurrentVendor() vendor: VendorContext, @Query() q: PayoutsPageQueryDto) {
    const { items, nextCursor } = await this.payouts.listForVendor(vendor.id, q.cursor, q.limit);
    return new Paged(items, { nextCursor });
  }
}

/** The rider's cash screen. */
@ApiTags('rider')
@ApiBearerAuth()
@Roles(Role.RIDER)
@UseGuards(RiderContextGuard)
@RequireRiderStatus('APPROVED', 'SUSPENDED')
@Controller('rider')
export class RiderCodController {
  constructor(private readonly cod: CodService) {}

  /** Cash collected from customers that has not been handed in yet, and recent hand-ins. */
  @Get('cod')
  summary(@CurrentRider() rider: RiderContext) {
    return this.cod.riderSummary(rider.id);
  }
}

/** Admin: commission settings, cash-on-delivery settlements, payouts and vendor ledgers. */
@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminFinanceController {
  constructor(
    private readonly commission: CommissionAdminService,
    private readonly cod: CodService,
    private readonly payouts: PayoutsService,
    private readonly earnings: EarningsService,
  ) {}

  // ───── commission ─────

  /** Every commission rule, with which one is in force now. Newest start first within each scope. */
  @Get('commission-rules')
  rules(@Query() q: ListCommissionRulesQueryDto) {
    return this.commission.list(q);
  }

  /** Add a rule. It applies to orders placed from its start time on; earlier orders keep their rate. */
  @Post('commission-rules')
  createRule(@Body() dto: CreateCommissionRuleDto, @CurrentUser() admin: AuthUser, @Req() req: AuthedRequest) {
    return this.commission.create(dto, admin.id, req.id);
  }

  /** Remove a rule that has not started yet. */
  @Delete('commission-rules/:id')
  @HttpCode(204)
  async removeRule(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthUser, @Req() req: AuthedRequest) {
    await this.commission.remove(id, admin.id, req.id);
  }

  // ───── cash on delivery ─────

  /** Riders who are holding customers' cash, biggest first. */
  @Get('cod/riders')
  ridersOwing() {
    return this.cod.ridersOwing();
  }

  /** The cash one rider has collected and not yet handed in, oldest first. */
  @Get('cod/riders/:id/collections')
  collections(@Param('id', ParseUUIDPipe) id: string) {
    return this.cod.riderCollections(id);
  }

  /** Record a rider's deposit. Credits the vendors of those orders in the same step. */
  @Post('cod/settlements')
  settle(@Body() dto: SettleCodDto, @CurrentUser() admin: AuthUser, @Req() req: AuthedRequest) {
    return this.cod.settle(admin.id, dto, req.id);
  }

  @Get('cod/settlements')
  async settlements(@Query() q: ListSettlementsQueryDto) {
    const { items, nextCursor } = await this.cod.settlements(q.riderId, q.cursor, q.limit);
    return new Paged(items, { nextCursor });
  }

  // ───── payouts ─────

  /** Withdrawal requests, newest first. Try `status=REQUESTED` for the queue. */
  @Get('payouts')
  async listPayouts(@Query() q: ListPayoutsQueryDto) {
    const { items, nextCursor } = await this.payouts.list(q);
    return new Paged(items, { nextCursor });
  }

  /** The request with the vendor's real account number, for paying it. Each view is audited. */
  @Get('payouts/:id')
  payout(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthUser, @Req() req: AuthedRequest) {
    return this.payouts.detail(id, admin.id, req.id);
  }

  @Post('payouts/:id/approve')
  @HttpCode(200)
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthUser, @Req() req: AuthedRequest) {
    return this.payouts.approve(id, admin.id, req.id);
  }

  /** Record that the money was sent. Debits the vendor's ledger. */
  @Post('payouts/:id/pay')
  @HttpCode(200)
  pay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PayPayoutDto, @CurrentUser() admin: AuthUser, @Req() req: AuthedRequest) {
    return this.payouts.pay(id, admin.id, dto.txnRef, dto.note, req.id);
  }

  @Post('payouts/:id/reject')
  @HttpCode(200)
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectPayoutDto, @CurrentUser() admin: AuthUser, @Req() req: AuthedRequest) {
    return this.payouts.reject(id, admin.id, dto.reason, req.id);
  }

  // ───── vendor ledger ─────

  /** A vendor's balance and ledger, newest first. */
  @Get('vendors/:id/ledger')
  async ledger(@Param('id', ParseUUIDPipe) id: string, @Query() q: LedgerQueryDto) {
    const [balance, page] = await Promise.all([this.earnings.balance(id), this.earnings.ledgerPage(id, q.cursor, q.limit)]);
    return new Paged(page.items, { nextCursor: page.nextCursor, balance });
  }

  /** Correct a vendor's ledger with a new, explained entry (history is never edited). Audited. */
  @Post('ledger/adjustments')
  adjust(@Body() dto: LedgerAdjustmentDto, @CurrentUser() admin: AuthUser, @Req() req: AuthedRequest) {
    return this.commission.adjust(dto, admin.id, req.id);
  }
}
