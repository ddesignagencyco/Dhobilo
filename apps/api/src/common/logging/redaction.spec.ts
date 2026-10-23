import pino from 'pino';
import { REDACT_PATHS } from './logger.config';

/** Logs through a logger configured exactly as the app's, and returns what would have been written. */
function logged(line: Record<string, unknown>): string {
  const chunks: string[] = [];
  const logger = pino({ redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } }, { write: (s: string) => void chunks.push(s) });
  logger.info(line, 'event');
  return chunks.join('');
}

describe('log scrubbing for money (BE-6.15)', () => {
  const SECRETS = ['4111111111111111', 'merchant-pass', 'PK36SCBL0000001123456702', '+923001234567', 'super-secret-hash', 'bearer-abc', 'mock-signature-value'];

  it('removes card, wallet, gateway-secret and payout-account details wherever they show up one level down', () => {
    const out = logged({
      payment: { cardNumber: '4111111111111111', cvv: '123', pp_Password: 'merchant-pass', pp_SecureHash: 'super-secret-hash' },
      payout: { account: 'PK36SCBL0000001123456702', accountRef: 'ciphertext-here', phone: '+923001234567' },
      checkout: { formFields: { pp_Password: 'merchant-pass', pp_SecureHash: 'super-secret-hash' } },
      req: { headers: { authorization: 'bearer-abc', 'x-mock-signature': 'mock-signature-value', 'x-courier-signature': 'mock-signature-value' } },
      body: { pp_Password: 'merchant-pass', pp_SecureHash: 'super-secret-hash', account: 'PK36SCBL0000001123456702' },
    });
    for (const secret of SECRETS) expect(out).not.toContain(secret);
    expect(out).toContain('[REDACTED]');
  });

  it('keeps the harmless parts that make a log useful', () => {
    const out = logged({ payment: { id: 'p-1', gateway: 'mock', status: 'PAID', amount: '350.00', cardNumber: '4111111111111111' } });
    expect(out).toContain('"id":"p-1"');
    expect(out).toContain('"amount":"350.00"');
    expect(out).not.toContain('4111111111111111');
  });
});
