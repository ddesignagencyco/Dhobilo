import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthUser, AuthedRequest } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Paged } from '../../common/interceptors/response-envelope.interceptor';
import { AdminCancelOrderDto, AdminOrdersQueryDto } from '../orders/dto/vendor-orders.dto';
import { AdminOrdersService } from '../orders/admin-orders.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: AdminOrdersService) {}

  /** Find orders by status, vendor, customer or order number. Newest first; page with `meta.nextCursor`. */
  @Get()
  async list(@Query() query: AdminOrdersQueryDto) {
    const { items, nextCursor } = await this.orders.list(query);
    return new Paged(items, { nextCursor });
  }

  /** Everything about an order: money incl. commission, items, payments, full history with actors. */
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.orders.detail(id);
  }

  /** Cancel an order on a customer's or vendor's behalf. A reason is required and is shown to both. */
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string, @Body() dto: AdminCancelOrderDto, @CurrentUser() admin: AuthUser, @Req() req: AuthedRequest) {
    return this.orders.cancel(admin, id, dto.reason, req.id);
  }
}
