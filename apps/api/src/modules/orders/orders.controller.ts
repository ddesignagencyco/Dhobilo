import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import type { AuthUser, AuthedRequest } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OwnedBy } from '../../common/decorators/owned-by.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Paged } from '../../common/interceptors/response-envelope.interceptor';
import { ListOrdersQueryDto, PlaceOrderDto } from './dto/orders.dto';
import { OrderOwnership } from './order-ownership';
import { OrdersService, parseIdempotencyKey } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@Roles(Role.CUSTOMER)
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /**
   * Place an order (cash on delivery for now). Send a fresh `Idempotency-Key` per checkout and reuse it when
   * retrying after a network failure: you get the same order back (200) instead of a duplicate. 201 = created.
   */
  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: '8-100 chars; a UUID is ideal. Reuse it on retries.' })
  async place(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: PlaceOrderDto,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { order, replayed } = await this.orders.place(user, parseIdempotencyKey(key), dto, req.id);
    res.status(replayed ? 200 : 201);
    if (replayed) res.setHeader('Idempotent-Replay', 'true');
    return order;
  }

  /** Order history, newest first. Page with `meta.nextCursor`; optional `status` filter. */
  @Get()
  async list(@CurrentUser() user: AuthUser, @Query() query: ListOrdersQueryDto) {
    const { items, nextCursor } = await this.orders.list(user.id, query);
    return new Paged(items, { nextCursor });
  }

  @Get(':id')
  @OwnedBy(OrderOwnership)
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.getOwn(user.id, id);
  }
}
