import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod } from '@prisma/client';
import { AppException } from '../../../common/errors/app.exception';
import { Money, money } from '../../../common/money/money';
import type { Env } from '../../../config/env';
import type { CheckoutInput, CheckoutResult, GatewayStatus, PaymentGateway, RefundResult, VerifiedPaymentEvent } from '../payment-gateway';
import { isMockMode, mockCheckout } from './mock-checkout';
import { hmacHex, parseRawBody, signaturesMatch, statusFrom, unauthenticated, verifyMockWebhook } from './gateway-support';

/**
 * JazzCash's "secure hash" (from their published hosted-checkout integration guide): the `pp_` / `ppmpf_` fields sorted
 * by name, the non-empty values joined with `&` behind the integrity salt, then HMAC-SHA256 keyed with that salt, in
 * upper-case hex. The same rule signs what we send and what they send back.
 */
export function jazzCashHash(fields: Record<string, string>, integritySalt: string): string {
  const values = Object.keys(fields)
    .filter((k) => k !== 'pp_SecureHash' && /^(pp_|ppmpf_)/.test(k) && fields[k] !== '' && fields[k] != null)
    .sort()
    .map((k) => fields[k]);
  return hmacHex(integritySalt, [integritySalt, ...values].join('&')).toUpperCase();
}

/** The response code JazzCash uses for a successful payment. Every other code is a failure. */
export const JAZZCASH_SUCCESS_CODE = '000';

/**
 * JazzCash hosted checkout (TRD §13). Card/wallet credentials never reach our servers.
 *
 * Signing follows JazzCash's published rule (see jazzCashHash) and is unit-tested, but this adapter has not been run
 * against the JazzCash sandbox, and the status-inquiry and refund endpoints are assumptions: confirm them with
 * JazzCash before going live.
 */
@Injectable()
export class JazzCashGateway implements PaymentGateway {
  readonly code = 'jazzcash' as const;
  readonly method = PaymentMethod.JAZZCASH;
  readonly label = 'JazzCash';

  constructor(private readonly config: ConfigService<Env, true>) {}

  async initiate(input: CheckoutInput, gatewayRef?: string): Promise<CheckoutResult> {
    if (isMockMode(this.config)) return mockCheckout(this.config, this.code, input, gatewayRef);
    const required = this.required();
    const ref = gatewayRef ?? `JC${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const date = new Date(Date.now() + 5 * 3_600_000).toISOString().replace(/\D/g, '').slice(0, 14);
    const fields: Record<string, string> = {
      pp_Version: '1.1',
      pp_TxnType: 'MWALLET',
      pp_Language: 'EN',
      pp_MerchantID: required.merchantId,
      pp_Password: required.password,
      pp_TxnRefNo: ref,
      pp_Amount: input.amount.mul(100).toFixed(0),
      pp_TxnCurrency: 'PKR',
      pp_TxnDateTime: date,
      pp_BillReference: input.orderNo,
      pp_Description: input.description,
      pp_ReturnURL: required.returnUrl || this.config.get('APP_URL', { infer: true }),
      pp_MobileNumber: input.customerPhone,
      pp_CNIC: '',
    };
    fields.pp_SecureHash = this.sign(fields);
    return { gatewayRef: ref, redirectUrl: required.apiUrl, formFields: fields };
  }

  verifyWebhook(headers: Record<string, string | string[] | undefined>, rawBody: Buffer): VerifiedPaymentEvent {
    if (isMockMode(this.config)) {
      const secret = this.config.get('PAYMENT_MOCK_WEBHOOK_SECRET', { infer: true });
      return verifyMockWebhook(this.code, headers, rawBody, secret);
    }
    const body = parseRawBody(rawBody, headers['content-type']);
    const given = String(body.pp_SecureHash ?? '');
    const expected = this.sign(Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v)])));
    if (!given || !signaturesMatch(expected, given.toUpperCase())) throw unauthenticated();
    // A signed notification is believed either way: '000' is a payment, any other code is a decline or error.
    if (typeof body.pp_TxnRefNo !== 'string' || body.pp_ResponseCode === undefined) throw unauthenticated();
    const status = String(body.pp_ResponseCode) === JAZZCASH_SUCCESS_CODE ? 'PAID' : 'FAILED';
    return {
      gateway: this.code,
      gatewayRef: body.pp_TxnRefNo,
      status,
      amount: money(String(Number(body.pp_Amount) / 100)),
      eventId: body.pp_RetreivalReferenceNo ? String(body.pp_RetreivalReferenceNo) : undefined,
      payload: { status, code: body.pp_ResponseCode ?? null, amount: String(Number(body.pp_Amount) / 100) },
    };
  }

  async status(gatewayRef: string): Promise<GatewayStatus> {
    if (isMockMode(this.config)) return { status: 'PENDING' };
    const required = this.required();
    const fields = { pp_MerchantID: required.merchantId, pp_Password: required.password, pp_TxnRefNo: gatewayRef };
    const res = await this.post(`${required.apiUrl}/status`, { ...fields, pp_SecureHash: this.sign(fields) });
    const status = statusFrom(res.pp_ResponseCode) ?? 'PENDING';
    return { status, amount: res.pp_Amount ? money(String(Number(res.pp_Amount) / 100)) : undefined, payload: { code: res.pp_ResponseCode } };
  }

  async refund(gatewayRef: string, amount: Money, reason?: string): Promise<RefundResult> {
    if (isMockMode(this.config)) return { refundRef: `MOCK-REFUND-${gatewayRef}`, status: 'REFUNDED' };
    const required = this.required();
    const fields = { pp_MerchantID: required.merchantId, pp_Password: required.password, pp_TxnRefNo: gatewayRef, pp_Amount: amount.mul(100).toFixed(0), pp_Reason: reason ?? 'refund' };
    const res = await this.post(`${required.apiUrl}/refund`, { ...fields, pp_SecureHash: this.sign(fields) });
    if (statusFrom(res.pp_ResponseCode) !== 'PAID') throw gatewayError('JazzCash did not accept the refund.');
    return { refundRef: String(res.pp_RetreivalReferenceNo ?? `JC-R-${gatewayRef}`), status: 'REFUNDED' };
  }

  private required() {
    const merchantId = this.config.get('JAZZCASH_MERCHANT_ID', { infer: true });
    const password = this.config.get('JAZZCASH_PASSWORD', { infer: true });
    const salt = this.config.get('JAZZCASH_INTEGRITY_SALT', { infer: true });
    const apiUrl = this.config.get('JAZZCASH_API_URL', { infer: true }).replace(/\/$/, '');
    if (!merchantId || !password || !salt || !apiUrl) throw gatewayError('JazzCash is not configured.');
    return { merchantId, password, salt, apiUrl, returnUrl: this.config.get('JAZZCASH_RETURN_URL', { infer: true }) };
  }

  private sign(fields: Record<string, string>): string {
    const { salt } = this.required();
    return jazzCashHash(fields, salt);
  }

  private async post(url: string, body: Record<string, string>): Promise<Record<string, unknown>> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    });
    if (!res.ok) throw gatewayError(`JazzCash answered ${res.status}.`);
    return (await res.json()) as Record<string, unknown>;
  }
}

const gatewayError = (message: string) => new AppException('PAYMENT_GATEWAY_UNAVAILABLE', message, HttpStatus.BAD_GATEWAY);
