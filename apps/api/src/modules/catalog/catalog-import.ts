import { HttpStatus } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AppException } from '../../common/errors/app.exception';
import { IMPORT_MAX_ROWS, ImportItemDto } from './dto/catalog.dto';
import { csvToRecords } from './csv.util';
import type { ImportRowError } from './catalog.service';

const bad = (message: string) => new AppException('CATALOG_IMPORT_INVALID', message, HttpStatus.BAD_REQUEST);

/** CSV cells are strings; turn the numeric/boolean columns into real values before validation. */
export function coerceCsvRow(raw: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  for (const key of ['price', 'turnaroundHours']) {
    if (raw[key] !== undefined && raw[key] !== '') out[key] = Number(raw[key]);
  }
  if (raw.itemNameUr === '') delete out.itemNameUr;
  if (raw.isActive === undefined || raw.isActive === '') delete out.isActive;
  else if (/^(true|false)$/i.test(raw.isActive)) out.isActive = raw.isActive.toLowerCase() === 'true';
  return out;
}

/** Accepts a CSV string or a JSON body `{ items: [...] }` and returns plain row objects. */
export function extractImportRows(body: unknown, isCsv: boolean): Record<string, unknown>[] {
  let rows: Record<string, unknown>[];
  if (isCsv) {
    if (typeof body !== 'string' || !body.trim()) throw bad('The CSV file is empty.');
    try {
      rows = csvToRecords(body).map(coerceCsvRow);
    } catch (err) {
      throw bad(`The CSV could not be read: ${(err as Error).message}.`);
    }
  } else {
    const items = (body as { items?: unknown } | null)?.items;
    if (!Array.isArray(items)) throw bad('Send { "items": [...] } or a CSV file.');
    rows = items as Record<string, unknown>[];
  }
  if (rows.length === 0) throw bad('There are no rows to import.');
  if (rows.length > IMPORT_MAX_ROWS) throw bad(`At most ${IMPORT_MAX_ROWS} rows can be imported at once.`);
  return rows;
}

/** Validates every row with the same rules as the single-item endpoints; returns row-numbered errors. */
export async function validateImportRows(rows: Record<string, unknown>[]): Promise<{ items: ImportItemDto[]; errors: ImportRowError[] }> {
  const items = rows.map((r) => plainToInstance(ImportItemDto, r && typeof r === 'object' ? r : {}));
  const errors: ImportRowError[] = [];
  await Promise.all(
    items.map(async (item, i) => {
      const found = await validate(item, { whitelist: true, forbidNonWhitelisted: true });
      if (found.length) {
        errors.push({ row: i + 1, errors: found.flatMap((e) => Object.values(e.constraints ?? { [e.property]: 'invalid' })) });
      }
    }),
  );
  return { items, errors: errors.sort((a, b) => a.row - b.row) };
}
