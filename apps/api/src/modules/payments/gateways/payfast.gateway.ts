import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod } from '@prisma/client';
import { AppException } from '../../../common/errors/app.exception';
import { Money, money } from '../../../common/money/money';
import type { Env } from '../../../config/env';
import type { CheckoutInput, CheckoutResult, GatewayStatus, PaymentGateway, RefundResult, VerifiedPaymentEvent } from '../payment-gateway';
import { isMockMode, mockCheckout } from './mock-checkout';
import { header, parseRawBody, signaturesMatch, sortedSignature, statusFrom, unauthenticated, verifyMockWebhook } from './gateway-support';

/** Card payments through PayFast's hosted page. Raw card data is never accepted by our API (TRD §13). */
@Injectable()
export class PayFastGateway implements PaymentGateway {
  readonly code = 'payfast' as const;
  readonly method = PaymentMethod.CARD;
  readonly label = 'Debit / credit card';

  constructor(private readonly config: ConfigService<Env, true>) {}

  async initiate(input: CheckoutInput, gatewayRef?: string): Promise<CheckoutResult> {
    if (isMockMode(this.config)) return mockCheckout(this.config, this.code, input, gatewayRef);
    const c = this.required();
    const ref = gatewayRef ?? `PF${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const fields: Record<string, string> = {
      merchant_id: c.merchantId,
      basket_id: ref,
      amount: input.amount.toFixed(2),
      currency: 'PKR',
      description: input.description,
      return_url: c.returnUrl || this.config.get('APP_URL', { infer: true }),
      email: input.customerEmail ?? '',
      phone: input.customerPhone,
    };
    fields.signature = sortedSignature(c.secureKey, fields);
    return { gatewayRef: ref, redirectUrl: c.apiUrl, formFields: fields };
  }

  verifyWebhook(headers: Record<string, string | string[] | undefined>, rawBody: Buffer): VerifiedPaymentEvent {
    if (isMockMode(this.config)) {
      return verifyMockWebhook(this.code, headers, rawBody, this.config.get('PAYMENT_MOCK_WEBHOOK_SECRET', { infer: true }));
    }
    const body = parseRawBody(rawBody, headers['content-type']);
    const given = header(headers, 'signature') ?? (typeof body.signature === 'string' ? body.signature : undefined);
    const expected = sortedSignature(this.required().secureKey, body, (k) => k === 'signature');
    if (!given || !signaturesMatch(expected, given)) throw unauthenticated();
    const status = statusFrom(body.status);
    if (!status || typeof body.basket_id !== 'string') throw unauthenticated();
    return {
      gateway: this.code,
      gatewayRef: body.basket_id,
      status,
      ...(body.amount !== undefined ? { amount: money(String(body.amount)) } : {}),
      eventId: body.transaction_id ? String(body.transaction_id) : undefined,
      payload: { status, transactionId: body.transaction_id ?? null, amount: body.amount ?? null },
    };
  }

  async status(gatewayRef: string): Promise<GatewayStatus> {
    if (isMockMode(this.config)) return { status: 'PENDING' };
    const c = this.required();
    const url = `${c.apiUrl}/status?merchant_id=${encodeURIComponent(c.merchantId)}&basket_id=${encodeURIComponent(gatewayRef)}`;
    const res = await fetch(url, { headers: { signature: sortedSignature(c.secureKey, { merchant_id: c.merchantId, basket_id: gatewayRef }) } }).catch(() => null);
    if (!res?.ok) throw gatewayError('PayFast did not answer the status check.');
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
    const payload = { merchant_id: c.merchantId, basket_id: gatewayRef, amount: amount.toFixed(2), reason: reason ?? 'refund' };
    const res = await fetch(`${c.apiUrl}/refund`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', signature: sortedSignature(c.secureKey, payload) },
      body: JSON.stringify(payload),
    }).catch(() => null);
    if (!res?.ok) throw gatewayError('PayFast did not accept the refund.');
    const body = (await res.json()) as Record<string, unknown>;
    return { refundRef: String(body.refund_id ?? `PF-R-${gatewayRef}`), status: statusFrom(body.status) === 'PAID' ? 'REFUNDED' : 'PENDING' };
  }

  private required() {
    const merchantId = this.config.get('PAYFAST_MERCHANT_ID', { infer: true });
    const secureKey = this.config.get('PAYFAST_SECURE_KEY', { infer: true });
    const apiUrl = this.config.get('PAYFAST_API_URL', { infer: true }).replace(/\/$/, '');
    if (!merchantId || !secureKey || !apiUrl) throw gatewayError('PayFast is not configured.');
    return { merchantId, secureKey, apiUrl, returnUrl: this.config.get('PAYFAST_RETURN_URL', { infer: true }) };
  }
}

const gatewayError = (message: string) => new AppException('PAYMENT_GATEWAY_UNAVAILABLE', message, HttpStatus.BAD_GATEWAY);
