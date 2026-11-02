'use client';

import { useState } from 'react';
import { Bike, Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { RiderStatus } from '@dhoblio/shared';
import { ActionDialog } from '@/components/admin/action-dialog';
import { CityFilter, EnumFilter, FilterBar, SearchFilter } from '@/components/admin/filter-bar';
import { LoadMore } from '@/components/admin/load-more';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/admin/states';
import { StatusBadge } from '@/components/admin/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { AdminRiderListItem } from '@/lib/api/types';
import { formatDate } from '@/lib/format';
import { useAdminMutation } from '@/lib/hooks/use-admin-mutation';
import { useCityNames } from '@/lib/hooks/use-cities';
import { useCursorList } from '@/lib/hooks/use-cursor-list';

const STATUSES = [
  RiderStatus.PENDING,
  RiderStatus.APPROVED,
  RiderStatus.REJECTED,
  RiderStatus.SUSPENDED,
] as const;

type Action = 'approve' | 'reject' | 'suspend' | 'reactivate';

/**
 * Rider approvals happen inline rather than on a detail page: a rider application is a name, a phone, a
 * city and a photo, so making an admin open a page per rider to approve a batch of twenty would be busy
 * work. Rejection still collects a reason, which the API requires and the rider sees.
 */
export function RidersTable({ initialStatus }: { initialStatus: string }) {
  const t = useTranslations();
  const cityNames = useCityNames();

  const [status, setStatus] = useState(initialStatus);
  const [cityId, setCityId] = useState('');
  const [q, setQ] = useState('');
  const [pending, setPending] = useState<{ rider: AdminRiderListItem; action: Action } | null>(null);

  const listKey = ['admin', 'riders', { status, cityId, q }];

  const list = useCursorList<AdminRiderListItem>({
    key: listKey,
    path: '/admin/riders',
    query: { status: status || undefined, cityId: cityId || undefined, q: q || undefined },
  });

  // Explicit, not `t(\`riders.${action}d\`)`: a concatenated message key is invisible to grep and to
  // every i18n linter, and silently renders the key itself when it does not exist.
  const successMessages: Record<Action, string> = {
    approve: t('riders.approveDone'),
    reject: t('riders.rejectDone'),
    suspend: t('riders.suspendDone'),
    reactivate: t('riders.reactivateDone'),
  };

  const mutation = useAdminMutation<unknown, { riderId: string; action: Action; reason: string }>({
    request: ({ riderId, action, reason }) => ({
      path: `/admin/riders/${riderId}/${action}`,
      options: reason ? { body: { reason } } : {},
    }),
    successMessage: (_r, { action }) => successMessages[action],
    invalidate: [['admin', 'riders']],
    onSuccess: () => setPending(null),
  });

  const hasFilters = !!status || !!cityId || !!q;

  const dialogCopy: Record<Action, { title: string; body: string; confirm: string; variant: 'default' | 'destructive' | 'success'; needsReason: boolean }> = {
    approve: { title: t('riders.approveTitle'), body: t('riders.approveBody'), confirm: t('riders.approve'), variant: 'success', needsReason: false },
    reject: { title: t('riders.rejectTitle'), body: t('riders.rejectBody'), confirm: t('riders.reject'), variant: 'destructive', needsReason: true },
    suspend: { title: t('riders.suspendTitle'), body: t('riders.suspendBody'), confirm: t('riders.suspend'), variant: 'destructive', needsReason: true },
    reactivate: { title: t('riders.reactivateTitle'), body: t('riders.reactivateBody'), confirm: t('riders.reactivate'), variant: 'success', needsReason: false },
  };

  const copy = pending ? dialogCopy[pending.action] : null;

  return (
    <>
      <FilterBar
        hasFilters={hasFilters}
        onClear={() => {
          setStatus('');
          setCityId('');
          setQ('');
        }}
      >
        <SearchFilter value={q} onChange={setQ} placeholder={t('riders.searchPlaceholder')} />
        <EnumFilter value={status} onChange={setStatus} options={STATUSES} anyLabel={t('common.all')} ariaLabel={t('common.status')} />
        <CityFilter value={cityId} onChange={setCityId} />
      </FilterBar>

      {list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : null}

      <Card className="gap-0 overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('common.name')}</TableHead>
              <TableHead>{t('common.phone')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead>{t('common.city')}</TableHead>
              <TableHead>{t('riders.online')}</TableHead>
              <TableHead>{t('riders.applied')}</TableHead>
              <TableHead className="text-end">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isInitialLoading ? (
              <TableSkeleton columns={7} />
            ) : list.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="p-0">
                  <EmptyState
                    icon={<Bike className="size-8" />}
                    title={t('riders.empty')}
                    hint={hasFilters ? t('common.noResultsHint') : t('riders.emptyHint')}
                  />
                </TableCell>
              </TableRow>
            ) : (
              list.items.map((rider) => (
                <TableRow key={rider.id}>
                  <TableCell className="font-medium">{rider.user?.name ?? '—'}</TableCell>
                  <TableCell>
                    <a className="font-mono text-xs text-primary hover:underline" href={`tel:${rider.user?.phone}`} dir="ltr">
                      {rider.user?.phone ?? '—'}
                    </a>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={rider.status} />
                  </TableCell>
                  <TableCell>{cityNames[rider.cityId] ?? `#${rider.cityId}`}</TableCell>
                  <TableCell>
                    {rider.status === RiderStatus.APPROVED ? (
                      <Badge variant={rider.isOnline ? 'success' : 'muted'}>
                        {rider.isOnline ? t('riders.onlineYes') : t('riders.onlineNo')}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">{formatDate(rider.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {rider.status === RiderStatus.PENDING ? (
                        <>
                          <Button variant="success" size="sm" onClick={() => setPending({ rider, action: 'approve' })}>
                            <Check />
                            {t('riders.approve')}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setPending({ rider, action: 'reject' })}>
                            <X />
                          </Button>
                        </>
                      ) : rider.status === RiderStatus.APPROVED ? (
                        <Button variant="outline" size="sm" onClick={() => setPending({ rider, action: 'suspend' })}>
                          {t('riders.suspend')}
                        </Button>
                      ) : rider.status === RiderStatus.SUSPENDED ? (
                        <Button variant="outline" size="sm" onClick={() => setPending({ rider, action: 'reactivate' })}>
                          {t('riders.reactivate')}
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
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

      {pending && copy ? (
        <ActionDialog
          open
          onOpenChange={(next) => !next && setPending(null)}
          title={copy.title}
          description={`${pending.rider.user?.name ?? ''} · ${pending.rider.user?.phone ?? ''} — ${copy.body}`}
          confirmLabel={copy.confirm}
          variant={copy.variant}
          pending={mutation.isPending}
          reason={copy.needsReason ? { label: t('common.reason'), placeholder: t('riders.reasonPlaceholder') } : undefined}
          onConfirm={(reason) => mutation.mutate({ riderId: pending.rider.id, action: pending.action, reason })}
        />
      ) : null}
    </>
  );
}
