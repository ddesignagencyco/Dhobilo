import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, VendorStatus } from '@prisma/client';
import type { AuthUser, AuthedRequest } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Paged } from '../../common/interceptors/response-envelope.interceptor';
import { CurrentVendor, RequireVendorStatus } from '../vendors/vendor-context';
import type { VendorContext } from '../vendors/vendor-context';
import { VendorContextGuard } from '../vendors/vendor-context.guard';
import { AdvanceOrderDto, RejectOrderDto, VendorOrdersQueryDto } from './dto/vendor-orders.dto';
import { VendorOrdersService } from './vendor-orders.service';

const VENDOR_PEOPLE = [Role.VENDOR_OWNER, Role.VENDOR_STAFF] as const;

/**
 * The vendor's order board. Owners and staff both work orders. A suspended vendor can still finish orders already
 * in progress but cannot take new ones.
 */
@ApiTags('vendor-orders')
@ApiBearerAuth()
@Roles(...VENDOR_PEOPLE)
@UseGuards(VendorContextGuard)
@Controller('vendor/orders')
export class VendorOrdersController {
  constructor(private readonly orders: VendorOrdersService) {}

  /** Board list. `?status=PLACED` is the "needs a response" tab (most urgent first). */
  @Get()
  @RequireVendorStatus(VendorStatus.APPROVED, VendorStatus.SUSPENDED)
  async list(@CurrentVendor() vendor: VendorContext, @Query() query: VendorOrdersQueryDto) {
    const { items, nextCursor } = await this.orders.list(vendor.id, query);
    return new Paged(items, { nextCursor });
  }

  /** Number of orders in each status, for the board's tab badges. */
  @Get('counts')
  @RequireVendorStatus(VendorStatus.APPROVED, VendorStatus.SUSPENDED)
  counts(@CurrentVendor() vendor: VendorContext) {
    return this.orders.counts(vendor.id);
  }

  @Get(':id')
  @RequireVendorStatus(VendorStatus.APPROVED, VendorStatus.SUSPENDED)
  detail(@CurrentVendor() vendor: VendorContext, @Param('id') id: string) {
    return this.orders.detail(vendor.id, id);
  }

  /** Accept a new order (must be done before `respondBy`, or it is auto-rejected). */
  @Post(':id/accept')
  @HttpCode(200)
  @RequireVendorStatus(VendorStatus.APPROVED)
  accept(@CurrentUser() user: AuthUser, @CurrentVendor() vendor: VendorContext, @Param('id') id: string, @Req() req: AuthedRequest) {
    return this.orders.accept(user, vendor.id, id, req.id);
  }

  /** Reject a new order with a reason the customer will see. */
  @Post(':id/reject')
  @HttpCode(200)
  @RequireVendorStatus(VendorStatus.APPROVED)
  reject(@CurrentUser() user: AuthUser, @CurrentVendor() vendor: VendorContext, @Param('id') id: string, @Body() dto: RejectOrderDto, @Req() req: AuthedRequest) {
    return this.orders.reject(user, vendor.id, id, dto.reason, req.id);
  }

  /** Move an accepted order forward: received -> in process -> ready -> handed to rider. One step at a time. */
  @Post(':id/status')
  @HttpCode(200)
  @RequireVendorStatus(VendorStatus.APPROVED, VendorStatus.SUSPENDED)
  advance(@CurrentUser() user: AuthUser, @CurrentVendor() vendor: VendorContext, @Param('id') id: string, @Body() dto: AdvanceOrderDto, @Req() req: AuthedRequest) {
    return this.orders.advance(user, vendor.id, id, dto.status, req.id);
  }
}
