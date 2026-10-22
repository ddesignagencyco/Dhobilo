import { normalizePkMobile } from './phone.util';

describe('normalizePkMobile', () => {
  it.each([
    ['03001234567', '+923001234567'],
    ['0300-1234567', '+923001234567'],
    ['+92 300 1234567', '+923001234567'],
    ['923001234567', '+923001234567'],
    ['00923001234567', '+923001234567'],
    ['3001234567', '+923001234567'],
    ['(0345) 123 4567', '+923451234567'],
  ])('normalises %s', (input, expected) => {
    expect(normalizePkMobile(input)).toBe(expected);
  });

  it.each(['', 'abc', '0300123456', '030012345678', '+15551234567', '0421234567', '+92 21 1234567'])(
    'rejects %s',
    (input) => {
      expect(normalizePkMobile(input)).toBeNull();
    },
  );
});
