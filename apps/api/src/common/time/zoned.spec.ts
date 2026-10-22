import { addDays, dayOfWeekOf, isValidDateString, localParts, localToUtc, tzOffsetMs } from './zoned';

const KHI = 'Asia/Karachi';

describe('zoned helpers (Asia/Karachi is UTC+5, no DST)', () => {
  it('knows the offset', () => {
    expect(tzOffsetMs(new Date('2026-06-01T12:00:00Z'), KHI)).toBe(5 * 3600_000);
    expect(tzOffsetMs(new Date('2026-01-01T12:00:00Z'), 'UTC')).toBe(0);
  });

  it('converts an instant to local wall-clock parts, including across midnight', () => {
    expect(localParts(new Date('2026-10-22T20:30:00Z'), KHI)).toEqual({ date: '2026-10-23', dayOfWeek: 5, minutes: 90 });
    expect(localParts(new Date('2026-10-22T03:00:00Z'), KHI)).toEqual({ date: '2026-10-22', dayOfWeek: 4, minutes: 480 });
  });

  it('converts local wall time back to the right UTC instant', () => {
    expect(localToUtc('2026-10-23', 9 * 60, KHI).toISOString()).toBe('2026-10-23T04:00:00.000Z');
    expect(localToUtc('2026-10-23', 0, KHI).toISOString()).toBe('2026-10-22T19:00:00.000Z');
    expect(localToUtc('2026-10-23', 1440, KHI).toISOString()).toBe('2026-10-23T19:00:00.000Z');
  });

  it('round-trips', () => {
    const utc = localToUtc('2026-03-08', 13 * 60 + 30, KHI);
    expect(localParts(utc, KHI)).toMatchObject({ date: '2026-03-08', minutes: 13 * 60 + 30 });
  });

  it('handles a DST zone too (New York, 2026-03-08 spring forward)', () => {
    expect(localToUtc('2026-03-07', 9 * 60, 'America/New_York').toISOString()).toBe('2026-03-07T14:00:00.000Z');
    expect(localToUtc('2026-03-09', 9 * 60, 'America/New_York').toISOString()).toBe('2026-03-09T13:00:00.000Z');
  });

  it('validates date strings', () => {
    expect(isValidDateString('2026-02-28')).toBe(true);
    for (const bad of ['2026-02-30', '2026-13-01', '26-01-01', '2026/01/01', '', 'tomorrow']) expect(isValidDateString(bad)).toBe(false);
  });

  it('does day arithmetic across month and year ends and weekdays', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(dayOfWeekOf('2026-10-23')).toBe(5); // Friday
  });
});
