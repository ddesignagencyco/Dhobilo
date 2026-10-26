import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { money } from '../../../common/money/money';
import { JAZZCASH_SUCCESS_CODE, JazzCashGateway, jazzCashHash } from './jazzcash.gateway';

const ENV: Record<string, string> = {
  PAYMENTS_MODE: 'live',
  APP_URL: 'https://app.test',
  JAZZCASH_MERCHANT_ID: 'MC1234',
  JAZZCASH_PASSWORD: 'merchant-pass',
  JAZZCASH_INTEGRITY_SALT: 'salty-salt',
  JAZZCASH_API_URL: 'https://sandbox.example.test/pay',
  JAZZCASH_RETURN_URL: 'https://api.test/return',
};
const gateway = (env: Record<string, string> = ENV) => new JazzCashGateway({ get: (k: string) => env[k] ?? '' } as unknown as ConfigService<never, true>);
const input = { orderId: 'o1', orderNo: 'DHB-LHR-000123', amount: money('510.00'), customerName: 'Ayesha', customerPhone: '03001234567', description: 'Dhoblio order DHB-LHR-000123' };

/** The rule written out from scratch, so the implementation is not compared with itself. */
const reference = (fields: Record<string, string>, salt: string) => {
  const values = Object.keys(fields).filter((k) => /^(pp_|ppmpf_)/.test(k) && k !== 'pp_SecureHash' && fields[k] !== '').sort().map((k) => fields[k]);
  return createHmac('sha256', salt).update([salt, ...values].join('&')).digest('hex').toUpperCase();
};
const signed = (fields: Record<string, string>) => ({ ...fields, pp_SecureHash: reference(fields, 'salty-salt') });
const form = (fields: Record<string, string>) => ({ headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: Buffer.from(new URLSearchParams(fields).toString()) });
const paid = { pp_TxnRefNo: 'T2026ABCD', pp_ResponseCode: JAZZCASH_SUCCESS_CODE, pp_ResponseMessage: 'Thank you for Using JazzCash', pp_Amount: '51000', pp_RetreivalReferenceNo: 'RRN-77' };

describe('JazzCash secure hash', () => {
  const fields = { pp_Amount: '35000', pp_MerchantID: 'MC1234', pp_TxnRefNo: 'T2026', pp_Language: 'EN', pp_SubMerchantID: '', ppmpf_1: '', other: 'ignored' };

  it('signs the sorted, non-empty pp_ fields behind the salt with HMAC-SHA256, in upper-case hex', () => {
    expect(jazzCashHash(fields, 'salt')).toBe(reference(fields, 'salt'));
    expect(jazzCashHash(fields, 'salt')).toMatch(/^[0-9A-F]{64}$/);
  });

  it('ignores field order, empty and non-pp_ fields, and an existing hash', () => {
    const shuffled = { pp_TxnRefNo: 'T2026', other: 'different', pp_Language: 'EN', pp_MerchantID: 'MC1234', pp_Amount: '35000', pp_SecureHash: 'OLD' };
    expect(jazzCashHash(shuffled, 'salt')).toBe(jazzCashHash(fields, 'salt'));
  });

  it('changes when any value or the salt changes', () => {
    const base = jazzCashHash(fields, 'salt');
    expect(jazzCashHash({ ...fields, pp_Amount: '35001' }, 'salt')).not.toBe(base);
    expect(jazzCashHash(fields, 'other')).not.toBe(base);
  });
});

describe('JazzCashGateway (live mode)', () => {
  it('builds a signed checkout form in paisa that carries no card details', async () => {
    const checkout = await gateway().initiate(input, 'T2026REF');
    expect(checkout).toMatchObject({ gatewayRef: 'T2026REF', redirectUrl: 'https://sandbox.example.test/pay' });
    const f = checkout.formFields!;
    expect(f).toMatchObject({ pp_Amount: '51000', pp_TxnCurrency: 'PKR', pp_TxnRefNo: 'T2026REF', pp_BillReference: 'DHB-LHR-000123', pp_ReturnURL: 'https://api.test/return', pp_MerchantID: 'MC1234' });
    expect(f.pp_SecureHash).toBe(reference(f, 'salty-salt'));
    expect(Object.keys(f).join(' ')).not.toMatch(/card|cvv|pan/i);
  });

  it('refuses to start a payment when JazzCash is not configured', async () => {
    await expect(gateway({ ...ENV, JAZZCASH_PASSWORD: '' }).initiate(input)).rejects.toMatchObject({ message: 'JazzCash is not configured.' });
  });

  describe('notifications', () => {
    it('believes a correctly signed success (form or JSON) and reads the amount back in rupees', () => {
      for (const { headers, body } of [form(signed(paid)), { headers: { 'content-type': 'application/json' }, body: Buffer.from(JSON.stringify(signed(paid))) }]) {
        const event = gateway().verifyWebhook(headers, body);
        expect(event).toMatchObject({ gateway: 'jazzcash', gatewayRef: 'T2026ABCD', status: 'PAID', eventId: 'RRN-77' });
        expect(event.amount!.toFixed(2)).toBe('510.00');
      }
    });

    it('records a signed decline as FAILED (any code other than 000), instead of rejecting it', () => {
      for (const code of ['124', '157', '999']) {
        const event = gateway().verifyWebhook(form(signed({ ...paid, pp_ResponseCode: code })).headers, form(signed({ ...paid, pp_ResponseCode: code })).body);
        expect(event.status).toBe('FAILED');
      }
    });

    it('refuses a wrong, missing or tampered signature', () => {
      const ok = signed(paid);
      const check = (fields: Record<string, string>) => () => gateway().verifyWebhook(form(fields).headers, form(fields).body);
      expect(check({ ...ok, pp_SecureHash: 'A'.repeat(64) })).toThrow('Invalid webhook signature');
      expect(check(paid)).toThrow('Invalid webhook signature');
      expect(check({ ...ok, pp_Amount: '100' })).toThrow('Invalid webhook signature'); // amount changed after signing
      expect(check({ ...ok, pp_TxnRefNo: 'T-OTHER' })).toThrow('Invalid webhook signature');
      expect(check({ ...ok, pp_ResponseCode: '124' })).toThrow('Invalid webhook signature'); // success turned into failure, or the reverse
    });

    it('accepts the hash in lower case too', () => {
      const f = signed(paid);
      const event = gateway().verifyWebhook(form({ ...f, pp_SecureHash: f.pp_SecureHash.toLowerCase() }).headers, form({ ...f, pp_SecureHash: f.pp_SecureHash.toLowerCase() }).body);
      expect(event.status).toBe('PAID');
    });

    it('keeps no secret in the payload it hands back for storage', () => {
      const event = gateway().verifyWebhook(form(signed({ ...paid, pp_Password: 'merchant-pass', pp_MerchantID: 'MC1234' })).headers, form(signed({ ...paid, pp_Password: 'merchant-pass', pp_MerchantID: 'MC1234' })).body);
      const text = JSON.stringify(event.payload);
      expect(text).not.toContain('merchant-pass');
      expect(text).not.toContain('MC1234');
      expect(text).not.toContain('pp_SecureHash');
    });
  });
});

describe('JazzCashGateway (mock mode)', () => {
  it('needs the mock secret to accept any notification, so an unset secret trusts nobody', () => {
    const g = gateway({ ...ENV, PAYMENTS_MODE: 'mock', PAYMENT_MOCK_WEBHOOK_SECRET: '' });
    const body = Buffer.from(JSON.stringify({ gatewayRef: 'MOCK-1', status: 'PAID' }));
    expect(() => g.verifyWebhook({ 'x-payment-signature': createHmac('sha256', '').update(body).digest('hex') }, body)).toThrow('Invalid webhook signature');
  });
});
