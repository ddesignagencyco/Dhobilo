import { maskAccount, normalizeIban, validIbanChecksum } from './payouts.service';
import { periodRange } from './earnings.service';

/** Check digits worked out independently of the code under test: 98 - (number mod 97), using BigInt. */
function ibanWithCheck(bank: string, account: string): string {
  const body = `${bank}${account}PK00`;
  const digits = [...body].map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c)).join('');
  const check = 98n - (BigInt(digits) % 97n);
  return `PK${String(check).padStart(2, '0')}${bank}${account}`;
}

describe('Pakistani IBAN', () => {
  const good = ibanWithCheck('HABB', '0012345678901234');

  it('accepts a well-formed IBAN with correct check digits, however it is typed', () => {
    expect(good).toMatch(/^PK\d{2}HABB0012345678901234$/);
    expect(normalizeIban(good)).toBe(good);
    expect(normalizeIban(good.toLowerCase())).toBe(good);
    expect(normalizeIban(good.replace(/(.{4})/g, '$1 '))).toBe(good);
    expect(validIbanChecksum(good)).toBe(true);
  });

  it('rejects wrong check digits, wrong length, wrong country and wrong shape', () => {
    const wrongCheck = `PK${good.slice(2, 4) === '99' ? '98' : '99'}${good.slice(4)}`;
    expect(normalizeIban(wrongCheck)).toBeNull();
    expect(normalizeIban(good.slice(0, -1))).toBeNull();
    expect(normalizeIban(`${good}0`)).toBeNull();
    expect(normalizeIban(good.replace('PK', 'GB'))).toBeNull();
    expect(normalizeIban(good.replace('HABB', '1234'))).toBeNull();
    expect(normalizeIban('')).toBeNull();
  });

  it('a single changed digit is caught by the checksum', () => {
    const last = good.slice(-1);
    const changed = good.slice(0, -1) + (last === '0' ? '1' : '0');
    expect(normalizeIban(changed)).toBeNull();
  });
});

describe('account masks', () => {
  it('shows the start and end of an IBAN only', () => {
    const iban = ibanWithCheck('HABB', '0012345678901234');
    const masked = maskAccount('BANK', iban);
    expect(masked).toHaveLength(24);
    expect(masked.startsWith(iban.slice(0, 4))).toBe(true);
    expect(masked.endsWith(iban.slice(-4))).toBe(true);
    expect(masked.slice(4, -4)).toMatch(/^\*+$/);
  });

  it('shows the start and end of a wallet number only', () => {
    expect(maskAccount('WALLET', '+923001234567')).toBe('+92300***567');
  });
});

describe('earnings periods', () => {
  it('a day is itself', () => expect(periodRange('day', '2026-10-23')).toEqual({ from: '2026-10-23', to: '2026-10-23' }));

  it('a week runs Monday to Sunday', () => {
    expect(periodRange('week', '2026-10-23')).toEqual({ from: '2026-10-19', to: '2026-10-25' }); // a Friday
    expect(periodRange('week', '2026-10-19')).toEqual({ from: '2026-10-19', to: '2026-10-25' }); // the Monday
    expect(periodRange('week', '2026-10-25')).toEqual({ from: '2026-10-19', to: '2026-10-25' }); // the Sunday
    expect(periodRange('week', '2026-10-26')).toEqual({ from: '2026-10-26', to: '2026-11-01' }); // next Monday
  });

  it('a month runs from the 1st to its last day, including February and year ends', () => {
    expect(periodRange('month', '2026-10-23')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(periodRange('month', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(periodRange('month', '2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(periodRange('month', '2026-12-31')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });
});
