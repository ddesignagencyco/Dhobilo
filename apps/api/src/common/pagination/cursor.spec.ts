import { afterCursor, decodeCursor, encodeCursor, sliceWithCursor } from './cursor';

const row = (n: number) => ({ id: `id-${n}`, createdAt: new Date(Date.UTC(2026, 0, n)) });

describe('cursor pagination', () => {
  it('round-trips a position', () => {
    const r = row(3);
    expect(decodeCursor(encodeCursor(r))).toEqual(r);
  });

  it('rejects garbage', () => {
    for (const bad of ['', 'not-base64!!', Buffer.from('{"t":"nope","i":"x"}').toString('base64url'), Buffer.from('[]').toString('base64url')]) {
      expect(() => decodeCursor(bad)).toThrow(/cursor/i);
    }
  });

  it('builds an empty filter without a cursor and a keyset filter with one', () => {
    expect(afterCursor(undefined)).toEqual({});
    const r = row(2);
    expect(afterCursor(encodeCursor(r))).toEqual({ OR: [{ createdAt: { gt: r.createdAt } }, { createdAt: r.createdAt, id: { gt: r.id } }] });
  });

  it('slices the look-ahead row and returns a next cursor only when more exist', () => {
    const more = sliceWithCursor([row(1), row(2), row(3)], 2);
    expect(more.items).toHaveLength(2);
    expect(decodeCursor(more.nextCursor!).id).toBe('id-2');

    const last = sliceWithCursor([row(1), row(2)], 2);
    expect(last.nextCursor).toBeNull();
    expect(sliceWithCursor([], 5)).toEqual({ items: [], nextCursor: null });
  });
});
