import { Controller, Headers, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { Public } from '../../common/decorators/public.decorator';
import { PaymentsService } from './payments.service';

type RawRequest = Request & { rawBody?: Buffer };

/** Gateway callbacks: no login, the provider proves itself with an HMAC over the exact raw body. */
@ApiTags('webhooks')
@Public()
@Controller('webhooks')
export class PaymentWebhooksController {
  constructor(private readonly payments: PaymentsService) {}

  @Post(':gateway')
  @HttpCode(200)
  receive(
    @Param('gateway') gateway: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() req: RawRequest,
  ) {
    if (!req.rawBody?.length) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, 'The raw request body is required.', HttpStatus.BAD_REQUEST);
    }
    return this.payments.receiveWebhook(gateway, headers, req.rawBody);
  }
}
