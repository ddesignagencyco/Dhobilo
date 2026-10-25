import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod } from '@prisma/client';
import { AppException } from '../../../common/errors/app.exception';
import { Money, money } from '../../../common/money/money';
import type { Env } from '../../../config/env';
import type { CheckoutInput, CheckoutResult, GatewayStatus, PaymentGateway, RefundResult, VerifiedPaymentEvent } from '../payment-gateway';
import { isMockMode, mockCheckout } from './mock-checkout';
import { header, hmacHex, parseRawBody, signaturesMatch, statusFrom, unauthenticated, verifyMockWebhook } from './gateway-support';

/** Raast / bank transfer through the merchant's bank-hosted page. */
@Injectable()
export class RaastGateway implements PaymentGateway {
  readonly code = 'raast' as const;
  readonly method = PaymentMethod.RAAST;
  readonly label = 'Raast / bank transfer';

  constructor(private readonly config: ConfigService<Env, true>) {}

  async initiate(input: CheckoutInput, gatewayRef?: string): Promise<CheckoutResult> {
    if (isMockMode(this.config)) return mockCheckout(this.config, this.code, input, gatewayRef);
    const c = this.required();
    const ref = gatewayRef ?? `RS${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const amount = input.amount.toFixed(2);
    const fields = {
      merchantId: c.merchantId,
      orderId: ref,
      amount,
      currency: 'PKR',
      description: input.description,
      returnUrl: c.returnUrl || this.config.get('APP_URL', { infer: true }),
      signature: this.sign(c.secret, c.merchantId, ref, amount, 'PKR'),
    };
    return { gatewayRef: ref, redirectUrl: c.apiUrl, formFields: fields };
  }

  verifyWebhook(headers: Record<string, string | string[] | undefined>, rawBody: Buffer): VerifiedPaymentEvent {
    if (isMockMode(this.config)) {
      return verifyMockWebhook(this.code, headers, rawBody, this.config.get('PAYMENT_MOCK_WEBHOOK_SECRET', { infer: true }));
    }
    const body = parseRawBody(rawBody, headers['content-type']);
    const given = header(headers, 'x-raast-signature');
    const ref = String(body.orderId ?? '');
    const amount = String(body.amount ?? '');
    const status = statusFrom(body.status);
    if (!given || !ref || !status) throw unauthenticated();
    const c = this.required();
    const expected = this.sign(c.secret, c.merchantId, ref, amount, String(body.currency ?? 'PKR'), String(body.status));
    if (!signaturesMatch(expected, given)) throw unauthenticated();
    return {
      gateway: this.code,
      gatewayRef: ref,
      status,
      ...(amount ? { amount: money(amount) } : {}),
      eventId: body.transactionId ? String(body.transactionId) : undefined,
      payload: { status, transactionId: body.transactionId ?? null, amount },
    };
  }

  async status(gatewayRef: string): Promise<GatewayStatus> {
    if (isMockMode(this.config)) return { status: 'PENDING' };
    const c = this.required();
    const url = `${c.apiUrl}/status?merchantId=${encodeURIComponent(c.merchantId)}&orderId=${encodeURIComponent(gatewayRef)}`;
    const res = await fetch(url, { headers: { 'x-raast-signature': this.sign(c.secret, c.merchantId, gatewayRef, '', '') } }).catch(() => null);
    if (!res?.ok) throw gatewayError('Raast did not answer the status check.');
    const body = (await res.json()) as Record<string, unknown>;
    return {
      status: statusFrom(body.status) ?? 'PENDING',
      ...(body.amount ? { amount: money(String(body.amount)) } : {}),
      payload: { status: body.status ?? null },
    };
  }

  async refund(gatewayRef: string, amount: Money, reason?: string): Promise<RefundResult> {
    if (isMockMode(this.config)) return { refundRef: `MOCK-REFUND-${gatewayRef}`, status: 'REFUNDED' };
    const c = this.required();
    const payload = { merchantId: c.merchantId, orderId: gatewayRef, amount: amount.toFixed(2), reason: reason ?? 'refund' };
    const res = await fetch(`${c.apiUrl}/refund`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-raast-signature': this.sign(c.secret, c.merchantId, gatewayRef, payload.amount, 'PKR') },
      body: JSON.stringify(payload),
    }).catch(() => null);
    if (!res?.ok) throw gatewayError('Raast did not accept the refund.');
    const body = (await res.json()) as Record<string, unknown>;
    return { refundRef: String(body.refundId ?? `RS-R-${gatewayRef}`), status: statusFrom(body.status) === 'PAID' ? 'REFUNDED' : 'PENDING' };
  }

  private required() {
    const merchantId = this.config.get('RAAST_MERCHANT_ID', { infer: true });
    const secret = this.config.get('RAAST_SECRET_KEY', { infer: true });
    const apiUrl = this.config.get('RAAST_API_URL', { infer: true }).replace(/\/$/, '');
    if (!merchantId || !secret || !apiUrl) throw gatewayError('Raast is not configured.');
    return { merchantId, secret, apiUrl, returnUrl: this.config.get('RAAST_RETURN_URL', { infer: true }) };
  }

  private sign(secret: string, merchantId: string, ref: string, amount: string, currency: string, status = ''): string {
    return hmacHex(secret, [merchantId, ref, amount, currency, status].filter(Boolean).join('.'));
  }
}

const gatewayError = (message: string) => new AppException('PAYMENT_GATEWAY_UNAVAILABLE', message, HttpStatus.BAD_GATEWAY);
