import { HttpStatus } from '@nestjs/common';
import { AppException } from '../errors/app.exception';

export const MAX_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 20;

export interface CursorPosition {
  createdAt: Date;
  id: string;
}

/** Opaque keyset cursor over (createdAt, id): stable under inserts, no OFFSET scans (TRD §5.1). */
export function encodeCursor(row: CursorPosition): string {
  return Buffer.from(JSON.stringify({ t: row.createdAt.toISOString(), i: row.id })).toString('base64url');
}

export function decodeCursor(cursor: string): CursorPosition {
  try {
    const { t, i } = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { t: string; i: string };
    const createdAt = new Date(t);
    if (Number.isNaN(createdAt.getTime()) || typeof i !== 'string' || !i) throw new Error('bad cursor');
    return { createdAt, id: i };
  } catch {
    throw new AppException('INVALID_CURSOR', 'The pagination cursor is invalid.', HttpStatus.BAD_REQUEST);
  }
}

/** Prisma `where` fragment selecting rows strictly after the cursor in (createdAt asc, id asc) order. */
export function afterCursor(cursor: string | undefined) {
  if (!cursor) return {};
  const { createdAt, id } = decodeCursor(cursor);
  return { OR: [{ createdAt: { gt: createdAt } }, { createdAt, id: { gt: id } }] };
}

/** Same as afterCursor but for newest-first lists (createdAt desc, id desc): rows strictly older than the cursor. */
export function beforeCursor(cursor: string | undefined) {
  if (!cursor) return {};
  const { createdAt, id } = decodeCursor(cursor);
  return { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] };
}

/** Trims the extra look-ahead row fetched with `take: limit + 1` and derives the next cursor. */
export function sliceWithCursor<T extends CursorPosition>(rows: T[], limit: number): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  return { items, nextCursor: hasMore ? encodeCursor(items[items.length - 1]) : null };
}
