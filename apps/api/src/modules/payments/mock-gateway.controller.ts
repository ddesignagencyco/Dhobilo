import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { AppException } from '../../common/errors/app.exception';
import { Public } from '../../common/decorators/public.decorator';
import { ErrorCode } from '../../common/errors/error-codes';
import { fmt, money } from '../../common/money/money';
import type { Env } from '../../config/env';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { MOCK_SIGNATURE_HEADER, MockGateway } from './gateway/mock.gateway';
import { PaymentsService } from './payments.service';

/**
 * The fake gateway's "hosted page", so the whole payment flow can be tried in Swagger or a browser without a merchant
 * account. Switched off (404) unless PAYMENT_MOCK_GATEWAY=true, which production refuses.
 */
@ApiTags('payments')
@Public()
@Controller('dev/mock-gateway')
export class MockGatewayController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: MockGateway,
    private readonly payments: PaymentsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** What the fake hosted page would show: the order, the amount, and two buttons (pay / decline) as links. */
  @Get(':ref')
  async page(@Param('ref') ref: string) {
    const p = await this.find(ref);
    const api = `${this.config.get('API_URL', { infer: true })}/api/v1/dev/mock-gateway/${ref}`;
    return { gatewayRef: ref, orderNo: p.order.orderNo, amount: fmt(money(p.amount)), currency: 'PKR', status: p.status, payUrl: `${api}/pay`, declineUrl: `${api}/decline` };
  }

  /** The customer pays. The gateway then notifies us, exactly as a real one would. */
  @Post(':ref/pay')
  @HttpCode(200)
  pay(@Param('ref') ref: string) {
    return this.finish(ref, 'PAID');
  }

  /** The customer's card is declined. */
  @Post(':ref/decline')
  @HttpCode(200)
  decline(@Param('ref') ref: string) {
    return this.finish(ref, 'FAILED');
  }

  private async finish(ref: string, outcome: 'PAID' | 'FAILED') {
    const p = await this.find(ref);
    const { rawBody, signature } = await this.gateway.simulate(ref, outcome, fmt(money(p.amount)));
    const result = await this.payments.ingest('mock', { [MOCK_SIGNATURE_HEADER]: signature }, Buffer.from(rawBody));
    return { gatewayRef: ref, outcome, notified: !result.duplicate };
  }

  private async find(ref: string) {
    if (!this.config.get('PAYMENT_MOCK_GATEWAY', { infer: true })) throw new AppException(ErrorCode.NOT_FOUND, 'Not found.', HttpStatus.NOT_FOUND);
    const p = await this.prisma.payment.findUnique({ where: { gateway_gatewayRef: { gateway: 'mock', gatewayRef: ref } }, select: { amount: true, status: true, order: { select: { orderNo: true } } } });
    if (!p) throw new AppException(ErrorCode.NOT_FOUND, 'No such payment.', HttpStatus.NOT_FOUND);
    return p;
  }
}
