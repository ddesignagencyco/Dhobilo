'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { BffError } from '@/lib/api/bff';
import { type ImportRowInput, useBulkImport } from '@/lib/vendor/hooks/use-vendor-catalog';

const COLUMNS = ['itemName', 'itemNameUr', 'category', 'serviceType', 'price', 'turnaroundHours', 'isActive'] as const;

interface RowError {
  row: number;
  errors: string[];
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      cells.push(cell.trim());
      cell = '';
    } else cell += ch;
  }
  cells.push(cell.trim());
  return cells;
}

/** Accepts a JSON array / `{ items: [...] }`, or CSV with a header row. Throws a message key on bad input. */
export function parseImport(text: string): ImportRowInput[] {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('empty');
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error('json');
    }
    const rows = Array.isArray(parsed) ? parsed : (parsed as { items?: unknown }).items;
    if (!Array.isArray(rows)) throw new Error('json');
    return rows as ImportRowInput[];
  }
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
  const header = splitCsvLine(lines[0]!);
  if (!header.includes('itemName')) throw new Error('header');
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const obj: Record<string, unknown> = {};
    header.forEach((name, i) => {
      const value = cells[i];
      if (value === undefined || value === '') return;
      if (name === 'price' || name === 'turnaroundHours') obj[name] = Number(value);
      else if (name === 'isActive') obj[name] = value.toLowerCase() === 'true';
      else obj[name] = value;
    });
    return obj as unknown as ImportRowInput;
  });
}

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations('vendor.catalog.import');
  const [text, setText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<RowError[]>([]);
  const [totalErrors, setTotalErrors] = useState(0);
  const [result, setResult] = useState<{
    created: number;
    updated: number;
  } | null>(null);
  const run = useBulkImport();

  async function submit() {
    setParseError(null);
    setRowErrors([]);
    setResult(null);
    let rows: ImportRowInput[];
    try {
      rows = parseImport(text);
    } catch (error) {
      setParseError(t(`parse.${error instanceof Error ? error.message : 'json'}`));
      return;
    }
    if (!rows.length) {
      setParseError(t('parse.empty'));
      return;
    }
    try {
      const data = await run.mutateAsync(rows);
      setResult(data);
    } catch (error) {
      if (error instanceof BffError) {
        const details = error.details as { errors?: RowError[]; totalErrors?: number } | undefined;
        if (details?.errors?.length) {
          setRowErrors(details.errors);
          setTotalErrors(details.totalErrors ?? details.errors.length);
          return;
        }
      }
      setParseError(error instanceof Error ? error.message : t('parse.json'));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !run.isPending && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('hint')}</DialogDescription>
        </DialogHeader>

        <p className="text-muted-foreground text-xs" dir="ltr">
          {COLUMNS.join(', ')}
        </p>

        <div className="space-y-2">
          <input
            type="file"
            accept=".csv,.json,text/csv,application/json"
            aria-label={t('chooseFile')}
            className="text-sm file:me-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) setText(await file.text());
            }}
          />
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            dir="ltr"
            placeholder={t('placeholder')}
            aria-label={t('paste')}
            className="font-mono text-xs"
          />
        </div>

        {parseError ? (
          <Alert variant="destructive">
            <AlertDescription>{parseError}</AlertDescription>
          </Alert>
        ) : null}

        {rowErrors.length ? (
          <Alert variant="destructive">
            <AlertDescription>
              <p className="font-medium">{t('invalidRows')}</p>
              <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-y-auto ps-5 text-xs">
                {rowErrors.map((r) => (
                  <li key={r.row}>
                    {t('rowError', { row: r.row })}: {r.errors.join('; ')}
                  </li>
                ))}
              </ul>
              {totalErrors > rowErrors.length ? (
                <p className="mt-1 text-xs">{t('moreErrors', { count: totalErrors - rowErrors.length })}</p>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        {result ? (
          <Alert variant="success">
            <AlertDescription>
              {t('result', {
                created: result.created,
                updated: result.updated,
              })}
            </AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={run.isPending}>
            {result ? t('close') : t('cancel')}
          </Button>
          {!result ? (
            <Button type="button" onClick={() => void submit()} disabled={run.isPending || !text.trim()}>
              {run.isPending ? <Loader2 className="animate-spin" /> : null}
              {run.isPending ? t('running') : t('run')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
