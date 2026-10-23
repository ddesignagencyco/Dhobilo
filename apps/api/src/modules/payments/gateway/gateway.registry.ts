import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod } from '@prisma/client';
import type { Env } from '../../../config/env';
import { PAYMENT_GATEWAYS, PaymentGateway } from './payment-gateway';

/** The online methods, in the order customers see them. */
export const ONLINE_METHODS = [PaymentMethod.CARD, PaymentMethod.JAZZCASH, PaymentMethod.EASYPAISA, PaymentMethod.RAAST] as const;

/**
 * Picks the gateway for a payment method (TRD §13.1). A method is offered only when something real can serve it:
 * JazzCash when its merchant credentials are set; everything else only through the fake gateway while
 * PAYMENT_MOCK_GATEWAY=true (never in production). Easypaisa, card and Raast adapters are added here when
 * the merchant accounts exist.
 */
@Injectable()
export class GatewayRegistry {
  private readonly byCode: Map<string, PaymentGateway>;

  constructor(
    @Inject(PAYMENT_GATEWAYS) gateways: PaymentGateway[],
    private readonly config: ConfigService<Env, true>,
  ) {
    this.byCode = new Map(gateways.map((g) => [g.code, g]));
  }

  forCode(code: string): PaymentGateway | null {
    return this.byCode.get(code) ?? null;
  }

  forMethod(method: PaymentMethod): PaymentGateway | null {
    if (method === PaymentMethod.COD) return null;
    if (method === PaymentMethod.JAZZCASH && this.byCode.has('jazzcash')) return this.byCode.get('jazzcash')!;
    return this.config.get('PAYMENT_MOCK_GATEWAY', { infer: true }) ? (this.byCode.get('mock') ?? null) : null;
  }

  /** COD plus every online method something can serve. */
  enabledMethods(): PaymentMethod[] {
    return [PaymentMethod.COD, ...ONLINE_METHODS.filter((m) => this.forMethod(m) !== null)];
  }
}
