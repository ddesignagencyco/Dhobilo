import { dayBounds, resolveDayRange } from './date-range';

const OPTS = { defaultDays: 7, maxDays: 31 };

describe('resolveDayRange (Pakistan-time days)', () => {
  it('defaults to the last 7 days ending today', () => {
    const r = resolveDayRange({}, '2026-10-26', OPTS);
    expect(r.from).toBe('2026-10-20');
    expect(r.to).toBe('2026-10-26');
    expect(r.days).toHaveLength(7);
  });

  it('maps whole days onto UTC instants (a Pakistan day starts at 19:00 UTC the evening before)', () => {
    const r = resolveDayRange({ from: '2026-10-24', to: '2026-10-25' }, '2026-10-26', OPTS);
    expect(r.start.toISOString()).toBe('2026-10-23T19:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-10-25T19:00:00.000Z');
    expect(dayBounds('2026-10-24').end.toISOString()).toBe('2026-10-24T19:00:00.000Z');
  });

  it('uses `to` as the anchor when only it is given, including across a month end', () => {
    const r = resolveDayRange({ to: '2026-11-02' }, '2026-12-01', OPTS);
    expect(r.days[0]).toBe('2026-10-27');
    expect(r.days.at(-1)).toBe('2026-11-02');
  });

  it('rejects impossible dates, a reversed range and a range that is too long', () => {
    for (const input of [{ from: '2026-02-30' }, { to: 'tomorrow' }, { from: '2026-10-26', to: '2026-10-20' }, { from: '2026-01-01', to: '2026-10-01' }]) {
      expect(() => resolveDayRange(input, '2026-10-26', OPTS)).toThrow();
    }
  });

  it('accepts exactly the maximum', () => {
    expect(resolveDayRange({ from: '2026-10-01', to: '2026-10-31' }, '2026-10-31', OPTS).days).toHaveLength(31);
    expect(() => resolveDayRange({ from: '2026-10-01', to: '2026-11-01' }, '2026-11-01', OPTS)).toThrow(/at most 31/);
  });
});
