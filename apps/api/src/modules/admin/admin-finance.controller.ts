import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminAreaOnly } from '../../common/decorators/admin-area.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Paged } from '../../common/interceptors/response-envelope.interceptor';
import { Audit } from '../audit/audit.decorator';
import { CodService } from '../finance/cod.service';
import { CommissionRulesService } from '../finance/commission-rules.service';
import {
  CodBalancesQueryDto,
  CodCollectionsQueryDto,
  CreateCommissionRuleDto,
  ListCommissionRulesQueryDto,
  ListPayoutsQueryDto,
  PayPayoutDto,
  RejectPayoutDto,
  SettleCodDto,
  UpdateCommissionRuleDto,
} from '../finance/dto/finance.dto';
import { PayoutsService } from '../finance/payouts.service';

@ApiTags('admin-finance')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@AdminAreaOnly('finance')
@Controller('admin')
export class AdminFinanceController {
  constructor(
    private readonly rules: CommissionRulesService,
    private readonly payouts: PayoutsService,
    private readonly cod: CodService,
  ) {}

  @Get('commission-rules')
  listRules(@Query() q: ListCommissionRulesQueryDto) {
    return this.rules.list(q);
  }

  /** A new rule applies from its effective date; earlier orders keep the rate they were priced with. */
  @Post('commission-rules')
  @Audit({ action: 'COMMISSION_RULE_CREATED', entity: 'CommissionRule' })
  createRule(@Body() dto: CreateCommissionRuleDto, @CurrentUser() admin: AuthUser) {
    return this.rules.create(dto, admin.id);
  }

  @Patch('commission-rules/:id')
  @Audit({ action: 'COMMISSION_RULE_UPDATED', entity: 'CommissionRule', idParam: 'id' })
  updateRule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCommissionRuleDto) {
    return this.rules.update(id, dto);
  }

  @Delete('commission-rules/:id')
  @HttpCode(204)
  @Audit({ action: 'COMMISSION_RULE_DELETED', entity: 'CommissionRule', idParam: 'id' })
  deleteRule(@Param('id', ParseUUIDPipe) id: string) {
    return this.rules.remove(id);
  }

  @Get('payouts')
  async listPayouts(@Query() q: ListPayoutsQueryDto) {
    const { items, nextCursor } = await this.payouts.list(q);
    return new Paged(items, { nextCursor });
  }

  @Post('payouts/:id/approve')
  @HttpCode(200)
  @Audit({ action: 'PAYOUT_APPROVED', entity: 'Payout', idParam: 'id' })
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthUser) {
    return this.payouts.approve(id, admin.id);
  }

  @Post('payouts/:id/reject')
  @HttpCode(200)
  @Audit({ action: 'PAYOUT_REJECTED', entity: 'Payout', idParam: 'id' })
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectPayoutDto, @CurrentUser() admin: AuthUser) {
    return this.payouts.reject(id, admin.id, dto);
  }

  /** Record the bank/wallet transfer reference; this debits the vendor's ledger. */
  @Post('payouts/:id/pay')
  @HttpCode(200)
  @Audit({ action: 'PAYOUT_PAID', entity: 'Payout', idParam: 'id' })
  pay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PayPayoutDto, @CurrentUser() admin: AuthUser) {
    return this.payouts.pay(id, admin.id, dto);
  }

  @Get('cod/balances')
  codBalances(@Query() q: CodBalancesQueryDto) {
    return this.cod.balances(q);
  }

  @Get('cod/collections')
  async codCollections(@Query() q: CodCollectionsQueryDto) {
    const { items, nextCursor } = await this.cod.collections(q);
    return new Paged(items, { nextCursor });
  }

  /** Takes all of a rider's unsettled cash in one settlement batch. */
  @Post('cod/settlements')
  @Audit({ action: 'COD_SETTLED', entity: 'CodSettlement' })
  settle(@Body() dto: SettleCodDto, @CurrentUser() admin: AuthUser) {
    return this.cod.settle(dto, admin.id);
  }
}
