import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env';
import type { CheckoutInput, CheckoutResult, GatewayCode } from '../payment-gateway';
import { mockRef } from './gateway-support';

/**
 * Development stand-in for every provider: a reference plus a redirect to the future checkout screen. The webhook
 * can be simulated with a signed JSON body (see the docs for POST /webhooks/{gateway}).
 */
export function mockCheckout(config: ConfigService<Env, true>, gateway: GatewayCode, input: CheckoutInput, gatewayRef?: string): CheckoutResult {
  const ref = gatewayRef ?? mockRef(gateway);
  const appUrl = config.get('APP_URL', { infer: true });
  return {
    gatewayRef: ref,
    redirectUrl: `${appUrl}/checkout/mock?gateway=${gateway}&ref=${encodeURIComponent(ref)}&amount=${input.amount.toFixed(2)}&order=${encodeURIComponent(input.orderNo)}`,
    formFields: {},
  };
}

export const isMockMode = (config: ConfigService<Env, true>): boolean => config.get('PAYMENTS_MODE', { infer: true }) === 'mock';
