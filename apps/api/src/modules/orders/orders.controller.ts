import { Body, Controller, Get, Headers, HttpCode, MessageEvent, Param, ParseUUIDPipe, Post, Query, Req, Res, Sse, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import type { AuthUser, AuthedRequest } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OwnedBy } from '../../common/decorators/owned-by.decorator';
import { AdminAreaOnly } from '../../common/decorators/admin-area.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Paged, RawResponse } from '../../common/interceptors/response-envelope.interceptor';
import { CancelOrderDto, ListOrdersQueryDto, PlaceOrderDto } from './dto/orders.dto';
import { OrderAccessService } from './order-access.service';
import { OrderOwnership } from './order-ownership';
import { OrderViewerGuard } from './order-viewer.guard';
import { OrderStreamService } from './order-stream.service';
import { OrdersService, parseIdempotencyKey } from './orders.service';

/** Roles that may look at an order they are connected to (customer, the vendor's people, support). */
const VIEWERS = [Role.CUSTOMER, Role.VENDOR_OWNER, Role.VENDOR_STAFF, Role.ADMIN] as const;

@ApiTags('orders')
@ApiBearerAuth()
@Roles(Role.CUSTOMER)
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly access: OrderAccessService,
    private readonly stream: OrderStreamService,
  ) {}

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

  /** Order history, newest first. Page with `meta.nextCursor`; filter by status, vendor and date range. */
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

  /** Cancel before pickup (while the order is PLACED or ACCEPTED). Later than that the order cannot be cancelled. */
  @Post(':id/cancel')
  @HttpCode(200)
  @OwnedBy(OrderOwnership)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelOrderDto, @Req() req: AuthedRequest) {
    return this.orders.cancel(user, id, dto.reason, req.id);
  }

  /**
   * Refill the cart for the same vendor from this order, using today's items and prices. The response lists items
   * that are gone and prices that changed; you then check out as usual.
   */
  @Post(':id/reorder')
  @HttpCode(200)
  @OwnedBy(OrderOwnership)
  reorder(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.reorder(user, id);
  }

  /** Every status change with who made it. Also the polling fallback if live updates are unavailable. */
  @Get(':id/timeline')
  @Roles(...VIEWERS)
  @AdminAreaOnly('orders')
  timeline(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orders.timeline(user, id);
  }

  /**
   * Live status updates as server-sent events (`text/event-stream`). Each `status` event has an `id`; reconnect with
   * the `Last-Event-ID` header to receive what you missed. A fresh connection starts with the current status.
   * A `ping` event arrives every 25 s. Send the bearer token in the Authorization header (use a fetch-based SSE
   * client in browsers; the native EventSource cannot set headers). Fall back to polling `GET /orders/:id`
   * every 15-30 s if the stream cannot be kept open.
   */
  @Sse(':id/events')
  @RawResponse()
  @Roles(...VIEWERS)
  @AdminAreaOnly('orders')
  @UseGuards(OrderViewerGuard)
  @ApiProduces('text/event-stream')
  events(@Param('id') id: string, @Headers('last-event-id') lastEventId?: string): Observable<MessageEvent> {
    return this.stream.open(id, lastEventId); // access is checked by OrderViewerGuard, before any header is sent
  }
}
