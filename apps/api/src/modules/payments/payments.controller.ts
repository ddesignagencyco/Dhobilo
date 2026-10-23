import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Request, Response } from 'express';
import type { AuthUser, AuthedRequest } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OwnedBy } from '../../common/decorators/owned-by.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Paged } from '../../common/interceptors/response-envelope.interceptor';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { OrderOwnership } from '../orders/order-ownership';
import { ListPaymentsQueryDto, PayOrderDto, RefundPaymentDto } from './dto/payments.dto';
import { ONLINE_METHODS, GatewayRegistry } from './gateway/gateway.registry';
import { PaymentsAdminService } from './payments-admin.service';
import { PaymentsService } from './payments.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const METHOD_INFO = {
  COD: { label: 'Cash on delivery', instructions: 'Pay the rider in cash when your clothes are delivered. Keep the exact amount ready.' },
  CARD: { label: 'Debit / credit card', instructions: 'You will be taken to a secure page to enter your card. We never see your card number.' },
  JAZZCASH: { label: 'JazzCash', instructions: 'You will be taken to JazzCash to pay from your mobile account or card.' },
  EASYPAISA: { label: 'Easypaisa', instructions: 'You will be taken to Easypaisa to pay from your mobile account or card.' },
  RAAST: { label: 'Raast', instructions: 'Pay by bank transfer or QR from your banking app.' },
} as const;

/** Methods, the gateways' notification address, and the page customers land on after paying. */
@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly registry: GatewayRegistry,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** The payment methods that can be used right now, with a short explanation each. Fees are always 0.00: we do not charge for payment. */
  @Public()
  @Get('methods')
  methods() {
    const enabled = new Set(this.registry.enabledMethods());
    return ['COD', ...ONLINE_METHODS].filter((m) => enabled.has(m as never)).map((m) => ({ method: m, ...METHOD_INFO[m as keyof typeof METHOD_INFO], online: m !== 'COD', fee: '0.00', currency: 'PKR' }));
  }

  /**
   * Where a gateway tells us a payment's result. No login: the gateway proves itself with a signature on the raw
   * request body. The call returns at once; the result is applied by the worker.
   */
  @Public()
  @Post('webhooks/:gateway')
  @HttpCode(200)
  webhook(@Param('gateway') gateway: string, @Req() req: RawBodyRequest<Request>) {
    return this.payments.ingest(gateway, req.headers, req.rawBody ?? Buffer.alloc(0));
  }

  /**
   * The page the gateway sends the customer's browser back to. It only forwards them to the order page: whether the
   * payment worked is decided by the signed notification, never by this visit.
   */
  @Public()
  @Get('return/:gateway')
  returnGet(@Query('order') order: string | undefined, @Res() res: Response) {
    res.redirect(303, this.returnTarget(order));
  }

  @Public()
  @Post('return/:gateway')
  @HttpCode(303)
  returnPost(@Query('order') order: string | undefined, @Res() res: Response) {
    res.redirect(303, this.returnTarget(order));
  }

  private returnTarget(order: string | undefined): string {
    const app = this.config.get('APP_URL', { infer: true });
    return order && UUID.test(order) ? `${app}/orders/${order}?payment=returned` : `${app}/orders`;
  }
}

/** The customer's payment screen for one order. */
@ApiTags('orders')
@ApiBearerAuth()
@Roles(Role.CUSTOMER)
@Controller('orders')
export class OrderPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Every payment attempt for the order, newest first. A pending online payment includes its checkout link. */
  @Get(':id/payment')
  @OwnedBy(OrderOwnership)
  attempts(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.payments.forCustomer(user.id, id);
  }

  /** Pay now / try again for an online order that is still unpaid. Starts a new attempt; earlier unfinished ones are dropped. */
  @Post(':id/pay')
  @HttpCode(200)
  @OwnedBy(OrderOwnership)
  pay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PayOrderDto, @CurrentUser() user: AuthUser) {
    return this.payments.retry(user, id, dto.method);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(
    private readonly admin: PaymentsAdminService,
    private readonly payments: PaymentsService,
  ) {}

  /** Payments, newest first. Filter by status, method or order number. */
  @Get()
  async list(@Query() q: ListPaymentsQueryDto) {
    const { items, nextCursor } = await this.admin.list(q);
    return new Paged(items, { nextCursor });
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.detail(id);
  }

  /** Refund a paid online payment in full. Also takes the vendor's share back if they were already credited. Audited. */
  @Post(':id/refund')
  @HttpCode(200)
  async refund(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RefundPaymentDto, @CurrentUser() admin: AuthUser, @Req() req: AuthedRequest) {
    await this.payments.refund(id, dto.reason, admin.id, req.id);
    return this.admin.detail(id);
  }
}
