import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { AppException } from '../../../common/errors/app.exception';
import type { Env } from '../../../config/env';
import { CheckoutInfo, GatewayEvent, GatewayStatus, PaymentGateway, PaymentRequest, RefundResult } from './payment-gateway';

/**
 * JazzCash's "secure hash": the `pp_` / `ppmpf_` fields sorted by name, the non-empty values joined with `&` behind the
 * integrity salt, then HMAC-SHA256 keyed with that salt, in upper-case hex. The same rule signs what we send and what
 * they send back. (From JazzCash's published hosted-checkout integration guide.)
 */
export function jazzCashHash(fields: Record<string, string>, integritySalt: string): string {
  const joined = Object.keys(fields)
    .filter((k) => k !== 'pp_SecureHash' && /^(pp_|ppmpf_)/.test(k) && fields[k] !== '' && fields[k] != null)
    .sort()
    .map((k) => fields[k])
    .join('&');
  return createHmac('sha256', integritySalt).update(`${integritySalt}&${joined}`).digest('hex').toUpperCase();
}

/** Pakistan time (UTC+5, no daylight saving) in JazzCash's yyyyMMddHHmmss format. */
export const jazzCashTime = (d: Date) => new Date(d.getTime() + 5 * 3_600_000).toISOString().replace(/[-:T]/g, '').slice(0, 14);

const SUCCESS_CODE = '000';

/**
 * JazzCash hosted checkout (FR-C8): the customer is sent to JazzCash's page with a signed form; JazzCash sends the
 * result back signed with the same rule. Built from JazzCash's published integration guide and unit-tested for the
 * signing rule; it has **not** been run against the JazzCash sandbox yet (needs merchant credentials). Status
 * inquiry and refunds are not implemented here: they are handled by support in the JazzCash portal until the
 * inquiry/refund API credentials are available.
 */
@Injectable()
export class JazzCashGateway implements PaymentGateway {
  readonly code = 'jazzcash';

  constructor(private readonly config: ConfigService<Env, true>) {}

  /** True when merchant credentials are configured. */
  get configured(): boolean {
    return !!(this.config.get('JAZZCASH_MERCHANT_ID', { infer: true }) && this.config.get('JAZZCASH_PASSWORD', { infer: true }) && this.config.get('JAZZCASH_INTEGRITY_SALT', { infer: true }));
  }

  async initiate(req: PaymentRequest): Promise<CheckoutInfo> {
    const salt = this.config.get('JAZZCASH_INTEGRITY_SALT', { infer: true });
    const txnRef = `T${jazzCashTime(new Date())}${randomBytes(2).toString('hex').toUpperCase()}`;
    const fields: Record<string, string> = {
      pp_Version: '1.1',
      pp_TxnType: '',
      pp_Language: 'EN',
      pp_MerchantID: this.config.get('JAZZCASH_MERCHANT_ID', { infer: true }),
      pp_SubMerchantID: '',
      pp_Password: this.config.get('JAZZCASH_PASSWORD', { infer: true }),
      pp_BankID: 'TBANK',
      pp_ProductID: 'RETL',
      pp_TxnRefNo: txnRef,
      pp_Amount: String(Math.round(Number(req.amount) * 100)), // paisa
      pp_TxnCurrency: 'PKR',
      pp_TxnDateTime: jazzCashTime(new Date()),
      pp_BillReference: req.orderNo.replace(/[^A-Za-z0-9]/g, ''),
      pp_Description: req.description.slice(0, 100),
      pp_TxnExpiryDateTime: jazzCashTime(req.expiresAt),
      pp_ReturnURL: req.returnUrl,
      ppmpf_1: '',
      ppmpf_2: '',
      ppmpf_3: '',
      ppmpf_4: '',
      ppmpf_5: '',
    };
    fields.pp_SecureHash = jazzCashHash(fields, salt);
    // The merchant password is part of the signed form but must not be kept in our database: it is added back by
    // hydrateCheckout() each time the form is handed to the customer's browser.
    const { pp_Password: _password, ...withoutPassword } = fields;
    void _password;
    return { gatewayRef: txnRef, redirectUrl: `${this.config.get('JAZZCASH_BASE_URL', { infer: true })}/CustomerPortal/transactionmanagement/merchantform/`, method: 'POST', formFields: withoutPassword };
  }

  hydrateCheckout(checkout: CheckoutInfo): CheckoutInfo {
    return { ...checkout, formFields: { ...checkout.formFields, pp_Password: this.config.get('JAZZCASH_PASSWORD', { infer: true }) } };
  }

  verifyWebhook(_headers: Record<string, string | string[] | undefined>, rawBody: Buffer): GatewayEvent | null {
    const salt = this.config.get('JAZZCASH_INTEGRITY_SALT', { infer: true });
    if (!salt) return null;
    let fields: Record<string, string>;
    try {
      const text = rawBody.toString('utf8');
      fields = text.trim().startsWith('{') ? (JSON.parse(text) as Record<string, string>) : Object.fromEntries(new URLSearchParams(text));
    } catch {
      return null;
    }
    const given = fields.pp_SecureHash;
    if (typeof given !== 'string' || !fields.pp_TxnRefNo || !fields.pp_ResponseCode) return null;
    const expected = Buffer.from(jazzCashHash(fields, salt));
    const actual = Buffer.from(given.toUpperCase());
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

    const paid = fields.pp_ResponseCode === SUCCESS_CODE;
    return {
      eventId: `${fields.pp_TxnRefNo}:${fields.pp_ResponseCode}`,
      gatewayRef: fields.pp_TxnRefNo,
      status: paid ? 'PAID' : 'FAILED',
      amount: fields.pp_Amount ? (Number(fields.pp_Amount) / 100).toFixed(2) : undefined,
      reason: paid ? undefined : fields.pp_ResponseMessage,
      // Only what support needs. The hash, merchant id and anything about the payer are left out.
      payload: { pp_TxnRefNo: fields.pp_TxnRefNo, pp_ResponseCode: fields.pp_ResponseCode, pp_ResponseMessage: fields.pp_ResponseMessage, pp_Amount: fields.pp_Amount, pp_RetreivalReferenceNo: fields.pp_RetreivalReferenceNo },
    };
  }

  async refund(): Promise<RefundResult> {
    throw new AppException('GATEWAY_UNSUPPORTED', 'JazzCash refunds are done by support in the JazzCash portal.', 501);
  }

  async status(): Promise<GatewayStatus> {
    throw new AppException('GATEWAY_UNSUPPORTED', 'JazzCash status inquiry is not available.', 501);
  }
}
