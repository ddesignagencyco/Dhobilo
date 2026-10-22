import { buildDaySlots } from './slots.service';

const KHI = 'Asia/Karachi';
const long = new Date('2000-01-01T00:00:00Z');

describe('buildDaySlots', () => {
  it('lays hourly windows back to back from opening time, in the city timezone', () => {
    const slots = buildDaySlots({ date: '2026-10-23', tz: KHI, opensAt: 9 * 60, closesAt: 12 * 60, earliest: long });
    expect(slots.map((s) => [s.start.toISOString(), s.end.toISOString()])).toEqual([
      ['2026-10-23T04:00:00.000Z', '2026-10-23T05:00:00.000Z'],
      ['2026-10-23T05:00:00.000Z', '2026-10-23T06:00:00.000Z'],
      ['2026-10-23T06:00:00.000Z', '2026-10-23T07:00:00.000Z'],
    ]);
  });

  it('never creates a window that runs past closing time', () => {
    expect(buildDaySlots({ date: '2026-10-23', tz: KHI, opensAt: 9 * 60, closesAt: 10 * 60 + 30, earliest: long })).toHaveLength(1);
    expect(buildDaySlots({ date: '2026-10-23', tz: KHI, opensAt: 9 * 60, closesAt: 9 * 60 + 59, earliest: long })).toHaveLength(0);
  });

  it('supports half-hour openings and a full 24-hour day', () => {
    const half = buildDaySlots({ date: '2026-10-23', tz: KHI, opensAt: 9 * 60 + 30, closesAt: 11 * 60 + 30, earliest: long });
    expect(half.map((s) => s.start.toISOString())).toEqual(['2026-10-23T04:30:00.000Z', '2026-10-23T05:30:00.000Z']);
    expect(buildDaySlots({ date: '2026-10-23', tz: KHI, opensAt: 0, closesAt: 1440, earliest: long })).toHaveLength(24);
  });

  it('drops windows that start before the earliest allowed time (but keeps one starting exactly then)', () => {
    const earliest = new Date('2026-10-23T05:00:00Z');
    const slots = buildDaySlots({ date: '2026-10-23', tz: KHI, opensAt: 9 * 60, closesAt: 12 * 60, earliest });
    expect(slots.map((s) => s.start.toISOString())).toEqual(['2026-10-23T05:00:00.000Z', '2026-10-23T06:00:00.000Z']);
  });

  it('returns nothing when everything is in the past', () => {
    expect(buildDaySlots({ date: '2026-10-23', tz: KHI, opensAt: 9 * 60, closesAt: 12 * 60, earliest: new Date('2030-01-01Z') })).toEqual([]);
  });
});
