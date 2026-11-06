'use client';

import { Fragment, useState } from 'react';
import { ChevronDown, ScrollText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FilterBar, SearchFilter } from '@/components/admin/filter-bar';
import { LoadMore } from '@/components/admin/load-more';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/admin/states';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { AuditLogEntry } from '@/lib/api/types';
import { formatDateTime, humanise } from '@/lib/format';
import { useCursorList } from '@/lib/hooks/use-cursor-list';

/** Renders a before/after snapshot without pretending to know its shape. */
function Snapshot({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="min-w-0 flex-1">
      <p className="text-muted-foreground mb-1 text-xs">{label}</p>
      <pre className="bg-muted/60 overflow-x-auto rounded-md p-2 text-[11px] leading-relaxed" dir="ltr">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

/**
 * The audit log. Super-admin only, matching the API: the query controller carries no @AdminAreaOnly tag,
 * and a route open to admins that names no area is super-admin-only by the fail-closed rule.
 *
 * Rows are read-only by construction — the table is append-only in the database, enforced by a trigger.
 */
export function AuditLogTable() {
  const t = useTranslations();
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const list = useCursorList<AuditLogEntry>({
    key: ['admin', 'audit-logs', { action, entity, from, to }],
    path: '/admin/audit-logs',
    query: {
      action: action || undefined,
      entity: entity || undefined,
      from: from || undefined,
      to: to || undefined,
    },
    limit: 50,
  });

  const hasFilters = !!action || !!entity || !!from || !!to;

  return (
    <>
      <FilterBar
        hasFilters={hasFilters}
        onClear={() => {
          setAction('');
          setEntity('');
          setFrom('');
          setTo('');
        }}
      >
        <SearchFilter value={action} onChange={setAction} placeholder={t('audit.actionPlaceholder')} />
        <SearchFilter value={entity} onChange={setEntity} placeholder={t('audit.entityPlaceholder')} />
        <div className="flex w-full items-center gap-1.5 sm:w-auto">
          <Label htmlFor="auditFrom" className="text-muted-foreground text-xs">
            {t('common.from')}
          </Label>
          <Input
            id="auditFrom"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="min-w-0 flex-1 sm:w-36 sm:flex-none"
            dir="ltr"
          />
        </div>
        <div className="flex w-full items-center gap-1.5 sm:w-auto">
          <Label htmlFor="auditTo" className="text-muted-foreground text-xs">
            {t('common.to')}
          </Label>
          <Input
            id="auditTo"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="min-w-0 flex-1 sm:w-36 sm:flex-none"
            dir="ltr"
          />
        </div>
      </FilterBar>

      {list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : null}

      <Card className="gap-0 overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('audit.when')}</TableHead>
              <TableHead>{t('audit.action')}</TableHead>
              <TableHead>{t('audit.entity')}</TableHead>
              <TableHead>{t('audit.actor')}</TableHead>
              <TableHead>{t('audit.ip')}</TableHead>
              <TableHead className="text-end">{t('common.details')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isInitialLoading ? (
              <TableSkeleton columns={6} />
            ) : list.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="p-0">
                  <EmptyState
                    icon={<ScrollText className="size-8" />}
                    title={t('audit.empty')}
                    hint={hasFilters ? t('common.noResultsHint') : t('audit.emptyHint')}
                  />
                </TableCell>
              </TableRow>
            ) : (
              list.items.map((entry) => {
                const open = expanded === entry.id;
                const hasSnapshot = entry.before !== null || entry.after !== null;
                return (
                  // A keyed Fragment, because each row can expand into a second row beneath it.
                  <Fragment key={entry.id}>
                    <TableRow>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {formatDateTime(entry.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-[11px]">
                          {entry.action}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{entry.entity}</span>
                        {entry.entityId ? (
                          <span className="text-muted-foreground ms-1 font-mono text-[11px]" dir="ltr">
                            {entry.entityId.slice(0, 8)}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{entry.actor?.name ?? t('audit.system')}</span>
                        {entry.actorRole ? (
                          <span className="text-muted-foreground ms-1 text-xs">({humanise(entry.actorRole)})</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs" dir="ltr">
                        {entry.ip ?? '—'}
                      </TableCell>
                      <TableCell className="text-end">
                        {hasSnapshot ? (
                          <button
                            type="button"
                            onClick={() => setExpanded(open ? null : entry.id)}
                            aria-expanded={open}
                            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
                          >
                            {open ? t('common.close') : t('common.details')}
                            <ChevronDown className={open ? 'size-3.5 rotate-180' : 'size-3.5'} />
                          </button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                    {open ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={6} className="bg-muted/30">
                          <div className="flex flex-col gap-3 sm:flex-row">
                            <Snapshot label={t('audit.before')} value={entry.before} />
                            <Snapshot label={t('audit.after')} value={entry.after} />
                          </div>
                          {entry.requestId ? (
                            <p className="text-muted-foreground mt-2 text-xs">
                              {t('common.requestId')}:{' '}
                              <code className="font-mono" dir="ltr">
                                {entry.requestId}
                              </code>
                            </p>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>

        <LoadMore
          shown={list.items.length}
          hasNextPage={!!list.hasNextPage}
          isLoading={list.isLoadingMore}
          onLoadMore={() => void list.fetchNextPage()}
        />
      </Card>
    </>
  );
}
