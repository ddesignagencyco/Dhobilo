import { withPoolSettings } from './prisma.service';

describe('withPoolSettings', () => {
  const url = 'postgresql://u:p@db:5432/dhoblio?schema=public';

  it('adds the pool size and timeout to a plain URL', () => {
    const out = new URL(withPoolSettings(url, 12, 7));
    expect(out.searchParams.get('connection_limit')).toBe('12');
    expect(out.searchParams.get('pool_timeout')).toBe('7');
    expect(out.searchParams.get('schema')).toBe('public');
    expect(out.username).toBe('u');
  });

  it('respects settings already in the URL (an operator override wins)', () => {
    const out = new URL(withPoolSettings(`${url}&connection_limit=3&pool_timeout=30`, 12, 7));
    expect(out.searchParams.get('connection_limit')).toBe('3');
    expect(out.searchParams.get('pool_timeout')).toBe('30');
  });

  it('leaves non-Postgres URLs alone', () => {
    expect(withPoolSettings('file:./dev.db', 5, 5)).toBe('file:./dev.db');
  });
});
