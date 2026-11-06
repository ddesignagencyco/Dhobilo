'use client';

import type { ReactNode } from 'react';
import { AlertCircle, Inbox, Loader2, WifiOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TableCell, TableRow } from '@/components/ui/table';
import { BffError } from '@/lib/api/bff';

export function EmptyState({
  title,
  hint,
  action,
  icon,
}: {
  title?: string;
  hint?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  const t = useTranslations('common');
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center max-md:sticky max-md:start-0 max-md:w-[calc(100vw-2.25rem)]">
      <div className="text-muted-foreground/60">{icon ?? <Inbox className="size-8" />}</div>
      <p className="font-medium">{title ?? t('noResults')}</p>
      <p className="text-muted-foreground max-w-sm text-sm">{hint ?? t('noResultsHint')}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

/**
 * The error surface for a failed load. It always shows the request ID when the API sent one — that is the
 * handle whoever is on support needs to find the matching line in the API log, and without it a bug report
 * is just "it broke".
 */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useTranslations();
  const isBff = error instanceof BffError;
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;

  if (offline) {
    return (
      <Alert variant="warning">
        <WifiOff />
        <AlertTitle>{t('errors.offlineShort')}</AlertTitle>
        <AlertDescription>{t('errors.offline')}</AlertDescription>
      </Alert>
    );
  }

  if (isBff && error.isForbidden) {
    return (
      <Alert variant="warning">
        <AlertCircle />
        <AlertTitle>{t('errors.forbidden')}</AlertTitle>
        <AlertDescription>{t('errors.forbiddenBody')}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>{t('errors.title')}</AlertTitle>
      <AlertDescription>
        <p>{error instanceof Error ? error.message : t('errors.generic')}</p>
        {isBff && error.requestId ? (
          <p className="text-xs">
            <span className="text-muted-foreground">{t('errors.traceHint')} </span>
            <code className="font-mono">{error.requestId}</code>
          </p>
        ) : null}
        {onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
            {t('common.retry')}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

/** Skeleton rows, so a slow table keeps its shape instead of collapsing and jumping (TRD §16.2). */
export function TableSkeleton({ rows = 6, columns }: { rows?: number; columns: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <TableRow key={r}>
          {Array.from({ length: columns }).map((__, c) => (
            <TableCell key={c}>
              <Skeleton className="h-4 w-full max-w-32" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

export function InlineSpinner({ label }: { label?: string }) {
  return (
    <span className="text-muted-foreground inline-flex items-center gap-2 text-sm">
      <Loader2 className="size-4 animate-spin" />
      {label}
    </span>
  );
}
