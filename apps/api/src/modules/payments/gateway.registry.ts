import { HttpStatus, Injectable } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { EasypaisaGateway } from './gateways/easypaisa.gateway';
import { JazzCashGateway } from './gateways/jazzcash.gateway';
import { PayFastGateway } from './gateways/payfast.gateway';
import { RaastGateway } from './gateways/raast.gateway';
import type { GatewayCode, PaymentGateway } from './payment-gateway';

/** Finds the adapter for a payment method or a webhook path ("card" is PayFast's hosted card page). */
@Injectable()
export class GatewayRegistry {
  private readonly byCode: Map<string, PaymentGateway>;

  constructor(jazzcash: JazzCashGateway, easypaisa: EasypaisaGateway, payfast: PayFastGateway, raast: RaastGateway) {
    const gateways = [jazzcash, easypaisa, payfast, raast];
    this.byCode = new Map(gateways.map((g) => [g.code, g]));
  }

  forMethod(method: PaymentMethod): PaymentGateway {
    const gateway = [...this.byCode.values()].find((g) => g.method === method);
    if (!gateway) throw new AppException('PAYMENT_METHOD_UNAVAILABLE', 'That payment method is not available.', HttpStatus.BAD_REQUEST);
    return gateway;
  }

  forWebhook(path: string): PaymentGateway {
    const code = path === 'card' ? 'payfast' : path;
    const gateway = this.byCode.get(code);
    if (!gateway) throw new AppException('NOT_FOUND', 'Unknown payment gateway.', HttpStatus.NOT_FOUND);
    return gateway;
  }

  forCode(code: GatewayCode): PaymentGateway {
    const gateway = this.byCode.get(code);
    if (!gateway) throw new AppException('PAYMENT_GATEWAY_UNAVAILABLE', 'Unknown payment gateway.', HttpStatus.BAD_GATEWAY);
    return gateway;
  }
}
