import { ttlToSeconds } from './ttl';

describe('ttlToSeconds', () => {
  it('converts each unit', () => {
    expect(ttlToSeconds('30s')).toBe(30);
    expect(ttlToSeconds('15m')).toBe(900);
    expect(ttlToSeconds('2h')).toBe(7200);
    expect(ttlToSeconds('1d')).toBe(86400);
  });

  it('rejects malformed values', () => {
    expect(() => ttlToSeconds('15 minutes')).toThrow();
    expect(() => ttlToSeconds('')).toThrow();
  });
});
