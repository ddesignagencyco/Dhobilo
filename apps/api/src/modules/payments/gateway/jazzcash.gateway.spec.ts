import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { JazzCashGateway, jazzCashHash, jazzCashTime } from './jazzcash.gateway';

const ENV = { JAZZCASH_MERCHANT_ID: 'MC1234', JAZZCASH_PASSWORD: 'merchant-pass', JAZZCASH_INTEGRITY_SALT: 'salty-salt', JAZZCASH_BASE_URL: 'https://sandbox.example.test' } as Record<string, string>;
const gateway = (env: Record<string, string> = ENV) => new JazzCashGateway({ get: (k: string) => env[k] ?? '' } as unknown as ConfigService<never, true>);
const request = { paymentId: 'p1', orderId: 'o1', orderNo: 'DHB-LHR-000123', amount: '350.00', customerPhone: '+923001234567', description: 'Dhoblio order DHB-LHR-000123', returnUrl: 'https://api.test/return', expiresAt: new Date('2026-10-23T05:15:00Z') };

/** The rule written out from scratch, so the implementation is not compared with itself. */
const reference = (fields: Record<string, string>, salt: string) => {
  const values = Object.keys(fields).filter((k) => /^(pp_|ppmpf_)/.test(k) && k !== 'pp_SecureHash' && fields[k] !== '').sort().map((k) => fields[k]);
  return createHmac('sha256', salt).update([salt, ...values].join('&')).digest('hex').toUpperCase();
};

describe('JazzCash secure hash', () => {
  const fields = { pp_Amount: '35000', pp_MerchantID: 'MC1234', pp_TxnRefNo: 'T2026', pp_Language: 'EN', pp_SubMerchantID: '', ppmpf_1: '', other: 'ignored' };

  it('signs the sorted, non-empty pp_ fields behind the salt with HMAC-SHA256, in upper-case hex', () => {
    const hash = jazzCashHash(fields, 'salt');
    expect(hash).toBe(reference(fields, 'salt'));
    expect(hash).toMatch(/^[0-9A-F]{64}$/);
  });

  it('does not depend on field order, ignores empty and non-pp_ fields, and ignores an existing hash', () => {
    const shuffled = { pp_TxnRefNo: 'T2026', other: 'something else', pp_Language: 'EN', pp_MerchantID: 'MC1234', pp_Amount: '35000', pp_SecureHash: 'OLD' };
    expect(jazzCashHash(shuffled, 'salt')).toBe(jazzCashHash(fields, 'salt'));
  });

  it('changes if any value or the salt changes', () => {
    const base = jazzCashHash(fields, 'salt');
    expect(jazzCashHash({ ...fields, pp_Amount: '35001' }, 'salt')).not.toBe(base);
    expect(jazzCashHash(fields, 'other-salt')).not.toBe(base);
  });

  it('formats times in Pakistan time (UTC+5) as yyyyMMddHHmmss', () => {
    expect(jazzCashTime(new Date('2026-10-23T05:15:09Z'))).toBe('20261023101509');
    expect(jazzCashTime(new Date('2026-10-23T22:00:00Z'))).toBe('20261024030000'); // crosses midnight
  });
});

describe('JazzCashGateway', () => {
  it('is only configured when all three credentials are set', () => {
    expect(gateway().configured).toBe(true);
    expect(gateway({ ...ENV, JAZZCASH_PASSWORD: '' }).configured).toBe(false);
    expect(gateway({}).configured).toBe(false);
  });

  it('builds a signed hosted-checkout form in paisa; the merchant password is signed but never stored', async () => {
    const g = gateway();
    const checkout = await g.initiate(request);
    expect(checkout).toMatchObject({ method: 'POST', redirectUrl: 'https://sandbox.example.test/CustomerPortal/transactionmanagement/merchantform/' });
    const f = checkout.formFields!;
    expect(f).toMatchObject({ pp_Amount: '35000', pp_TxnCurrency: 'PKR', pp_ReturnURL: 'https://api.test/return', pp_MerchantID: 'MC1234', pp_BillReference: 'DHBLHR000123', pp_TxnExpiryDateTime: '20261023101500' });
    expect(f.pp_TxnRefNo).toBe(checkout.gatewayRef);
    expect(f).not.toHaveProperty('pp_Password'); // what we keep
    expect(JSON.stringify(checkout)).not.toContain('merchant-pass');

    const sent = g.hydrateCheckout(checkout).formFields!; // what the customer's browser posts
    expect(sent.pp_Password).toBe('merchant-pass');
    expect(sent.pp_SecureHash).toBe(reference(sent, 'salty-salt')); // signed over the password too
  });

  describe('notifications', () => {
    const signed = (fields: Record<string, string>) => ({ ...fields, pp_SecureHash: reference(fields, 'salty-salt') });
    const success = { pp_TxnRefNo: 'T2026ABCD', pp_ResponseCode: '000', pp_ResponseMessage: 'Thank you for Using JazzCash', pp_Amount: '35000', pp_MerchantID: 'MC1234', pp_Password: 'merchant-pass' };
    const form = (f: Record<string, string>) => Buffer.from(new URLSearchParams(f).toString());

    it('accepts a correctly signed success (form or JSON) and reads the amount back in rupees', () => {
      for (const raw of [form(signed(success)), Buffer.from(JSON.stringify(signed(success)))]) {
        expect(gateway().verifyWebhook({}, raw)).toMatchObject({ eventId: 'T2026ABCD:000', gatewayRef: 'T2026ABCD', status: 'PAID', amount: '350.00' });
      }
    });

    it('treats any other response code as a failure, with the gateway’s message', () => {
      const event = gateway().verifyWebhook({}, form(signed({ ...success, pp_ResponseCode: '124', pp_ResponseMessage: 'Declined' })));
      expect(event).toMatchObject({ status: 'FAILED', reason: 'Declined', eventId: 'T2026ABCD:124' });
    });

    it('refuses a wrong, missing or tampered signature, and anything malformed', () => {
      const ok = signed(success);
      expect(gateway().verifyWebhook({}, form({ ...ok, pp_SecureHash: 'A'.repeat(64) }))).toBeNull();
      expect(gateway().verifyWebhook({}, form(success))).toBeNull();
      expect(gateway().verifyWebhook({}, form({ ...ok, pp_Amount: '100' }))).toBeNull(); // amount changed after signing
      expect(gateway().verifyWebhook({}, form({ ...ok, pp_ResponseCode: '000', pp_TxnRefNo: 'T-OTHER' }))).toBeNull();
      expect(gateway().verifyWebhook({}, Buffer.from('not a form or json {'))).toBeNull();
      expect(gateway({ ...ENV, JAZZCASH_INTEGRITY_SALT: '' }).verifyWebhook({}, form(ok))).toBeNull();
    });

    it('keeps nothing secret in the payload it hands back for storage', () => {
      const event = gateway().verifyWebhook({}, form(signed(success)))!;
      const text = JSON.stringify(event);
      expect(text).not.toContain('merchant-pass');
      expect(text).not.toContain('pp_SecureHash');
      expect(text).not.toContain('MC1234');
    });
  });

  it('says plainly that refunds and status checks are not available yet', async () => {
    await expect(gateway().refund()).rejects.toMatchObject({ code: 'GATEWAY_UNSUPPORTED' });
    await expect(gateway().status()).rejects.toMatchObject({ code: 'GATEWAY_UNSUPPORTED' });
  });
});
