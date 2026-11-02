import {
  compareMoney,
  formatMoney,
  formatMoneyCompact,
  formatRatePct,
  fromPaisa,
  isZeroMoney,
  subtractMoney,
  sumMoney,
  toPaisa,
} from './money';

describe('toPaisa', () => {
  it.each([
    ['0.00', 0],
    ['170.00', 17000],
    ['1200.50', 120050],
    ['1200.5', 120050],
    ['1200', 120000],
    ['0.01', 1],
    ['-45.25', -4525],
    ['9999999999.99', 999999999999],
  ])('parses %s', (input, expected) => {
    expect(toPaisa(input)).toBe(expected);
  });

  it('treats absent amounts as zero', () => {
    expect(toPaisa(null)).toBe(0);
    expect(toPaisa(undefined)).toBe(0);
    expect(toPaisa('')).toBe(0);
  });

  it.each(['abc', '1.234', '1,200.00', 'Rs 5', '1e3', 'NaN'])('refuses %s', (input) => {
    expect(() => toPaisa(input)).toThrow(/Not a money string/);
  });

  it('stays exact where a float would not', () => {
    // 0.1 + 0.2 in floats is 0.30000000000000004; in paisa it is 30.
    expect(sumMoney(['0.10', '0.20'])).toBe('0.30');
    // A long run of thirds that would drift as floats.
    expect(sumMoney(Array.from({ length: 300 }, () => '0.07'))).toBe('21.00');
  });
});

describe('fromPaisa', () => {
  it.each([
    [0, '0.00'],
    [1, '0.01'],
    [17000, '170.00'],
    [120050, '1200.50'],
    [-4525, '-45.25'],
  ])('renders %s', (input, expected) => {
    expect(fromPaisa(input)).toBe(expected);
  });

  it('round-trips every wire amount it is given', () => {
    for (const amount of ['0.00', '0.01', '170.00', '1200.50', '-45.25', '9999999999.99']) {
      expect(fromPaisa(toPaisa(amount))).toBe(amount);
    }
  });
});

describe('arithmetic', () => {
  it('subtracts exactly', () => {
    expect(subtractMoney('170.00', '30.00')).toBe('140.00');
    expect(subtractMoney('30.00', '170.00')).toBe('-140.00');
  });

  it('compares by value, not by string', () => {
    expect(compareMoney('9.00', '10.00')).toBeLessThan(0); // a string sort would get this backwards
    expect(compareMoney('170.00', '170.0')).toBe(0);
  });

  it('knows zero', () => {
    expect(isZeroMoney('0.00')).toBe(true);
    expect(isZeroMoney(null)).toBe(true);
    expect(isZeroMoney('0.01')).toBe(false);
  });
});

describe('formatting', () => {
  // Intl output contains a non-breaking space between symbol and digits; normalise it for the assertions.
  const norm = (s: string) => s.replace(/ /g, ' ');

  it('formats money for the panel', () => {
    expect(norm(formatMoney('1250.00'))).toBe('Rs 1,250.00');
    expect(norm(formatMoney('1250.00', { decimals: false }))).toBe('Rs 1,250');
  });

  it('shows a dash rather than Rs 0 for a missing amount', () => {
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(undefined)).toBe('—');
    expect(formatMoneyCompact(null)).toBe('—');
  });

  it('compacts large amounts for KPI tiles', () => {
    expect(norm(formatMoneyCompact('1200000.00'))).toBe('Rs 1.2M');
  });

  it('formats commission rates the way the API sends them', () => {
    expect(formatRatePct('15')).toBe('15%');
    expect(formatRatePct('12.50')).toBe('12.5%');
    expect(formatRatePct(8)).toBe('8%');
    expect(formatRatePct(null)).toBe('—');
  });
});
