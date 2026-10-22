import { fmt, money, parseMoney, round2, sum } from './money';

describe('money', () => {
  it('adds without floating-point error', () => {
    expect(sum([money('0.1'), money('0.2')]).toString()).toBe('0.3');
    expect(fmt(sum([money('19.99'), money('0.01')]))).toBe('20.00');
  });

  it('rounds half up to 2 places and formats with 2 decimals', () => {
    expect(round2(money('1.005')).toString()).toBe('1.01');
    expect(round2(money('2.675')).toString()).toBe('2.68');
    expect(fmt(money(150))).toBe('150.00');
    expect(fmt(money('1200.5'))).toBe('1200.50');
  });

  it('parses only plain 2-decimal amounts', () => {
    expect(parseMoney('250')?.toString()).toBe('250');
    expect(parseMoney('250.5')?.toString()).toBe('250.5');
    for (const bad of ['', '-5', '1.234', 'abc', '1e3', ' 5', '5 ', '99999999999']) expect(parseMoney(bad)).toBeNull();
  });
});
