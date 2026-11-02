'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, RotateCw, Truck, UserMinus, UserPlus, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { JobStatus, JobType, formatMoney } from '@dhoblio/shared';
import { Link } from '@/i18n/navigation';
import { ActionDialog } from '@/components/admin/action-dialog';
import { CityFilter, EnumFilter, FilterBar } from '@/components/admin/filter-bar';
import { LoadMore } from '@/components/admin/load-more';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/admin/states';
import { StatusBadge } from '@/components/admin/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { bffData } from '@/lib/api/bff';
import type { DeliveryJob, DeliverySummary } from '@/lib/api/types';
import { formatRelative, formatTime, humanise } from '@/lib/format';
import { useAdminMutation } from '@/lib/hooks/use-admin-mutation';
import { useCityNames } from '@/lib/hooks/use-cities';
import { useCursorList } from '@/lib/hooks/use-cursor-list';
import { AssignRiderDialog } from './assign-rider';

const STATUSES = [
  JobStatus.UNASSIGNED,
  JobStatus.ASSIGNED,
  JobStatus.ACCEPTED,
  JobStatus.IN_TRANSIT,
  JobStatus.COMPLETED,
  JobStatus.FAILED,
  JobStatus.CANCELLED,
] as const;

const TYPES = [JobType.PICKUP, JobType.DROP] as const;

/** The board refreshes itself: a dispatcher watching it must not be looking at a minute-old picture. */
const REFRESH_MS = 20_000;

function SummaryTiles() {
  const t = useTranslations('delivery');
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'delivery', 'summary'],
    queryFn: () => bffData<DeliverySummary>('/admin/delivery/summary'),
    refetchInterval: REFRESH_MS,
  });

  const tiles = [
    { label: t('unassigned'), value: data?.jobs?.UNASSIGNED ?? 0, tone: 'warning' as const },
    { label: t('inFlight'), value: (data?.jobs?.ACCEPTED ?? 0) + (data?.jobs?.IN_TRANSIT ?? 0), tone: 'info' as const },
    { label: t('needAttention'), value: data?.needAttention ?? 0, tone: 'destructive' as const },
    { label: t('ridersOnline'), value: data?.onlineRiders ?? 0, tone: 'success' as const },
  ];

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <Card key={tile.label} className="py-4">
          <CardContent className="px-4">
            <p className="text-muted-foreground text-xs">{tile.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular">{isLoading ? '—' : tile.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

type JobAction = 'unassign' | 'fail' | 'redispatch';

export function DispatchBoard({ initialStatus }: { initialStatus: string }) {
  const t = useTranslations();
  const cityNames = useCityNames();

  const [status, setStatus] = useState(initialStatus);
  const [jobType, setJobType] = useState('');
  const [cityId, setCityId] = useState('');
  const [assigning, setAssigning] = useState<DeliveryJob | null>(null);
  const [pending, setPending] = useState<{ job: DeliveryJob; action: JobAction } | null>(null);

  const list = useCursorList<DeliveryJob>({
    key: ['admin', 'delivery', 'jobs', { status, jobType, cityId }],
    path: '/admin/delivery/jobs',
    query: { status: status || undefined, jobType: jobType || undefined, cityId: cityId || undefined },
    refetchInterval: REFRESH_MS,
  });

  const successMessages: Record<JobAction, string> = {
    unassign: t('delivery.unassignDone'),
    fail: t('delivery.failDone'),
    redispatch: t('delivery.redispatchDone'),
  };

  const mutation = useAdminMutation<unknown, { jobId: string; action: JobAction; reason: string }>({
    request: ({ jobId, action, reason }) => ({
      path: `/admin/delivery/jobs/${jobId}/${action}`,
      options: action === 'fail' ? { body: { reason } } : {},
    }),
    successMessage: (_r, { action }) => successMessages[action],
    invalidate: [['admin', 'delivery']],
    onSuccess: () => setPending(null),
  });

  const hasFilters = !!status || !!jobType || !!cityId;

  const dialogCopy: Record<JobAction, { title: string; body: string; confirm: string; variant: 'default' | 'destructive'; needsReason: boolean }> = {
    unassign: { title: t('delivery.unassignTitle'), body: t('delivery.unassignBody'), confirm: t('delivery.unassign'), variant: 'destructive', needsReason: false },
    fail: { title: t('delivery.failTitle'), body: t('delivery.failBody'), confirm: t('delivery.fail'), variant: 'destructive', needsReason: true },
    redispatch: { title: t('delivery.redispatchTitle'), body: t('delivery.redispatchBody'), confirm: t('delivery.redispatch'), variant: 'default', needsReason: false },
  };
  const copy = pending ? dialogCopy[pending.action] : null;

  return (
    <>
      <SummaryTiles />

      <FilterBar
        hasFilters={hasFilters}
        onClear={() => {
          setStatus('');
          setJobType('');
          setCityId('');
        }}
      >
        <EnumFilter value={status} onChange={setStatus} options={STATUSES} anyLabel={t('common.all')} ariaLabel={t('common.status')} width="w-40" />
        <EnumFilter value={jobType} onChange={setJobType} options={TYPES} anyLabel={t('delivery.allTypes')} ariaLabel={t('delivery.jobType')} width="w-32" />
        <CityFilter value={cityId} onChange={setCityId} />
      </FilterBar>

      {list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : null}

      <Card className="gap-0 overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('common.orderNumber')}</TableHead>
              <TableHead>{t('delivery.leg')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead>{t('delivery.window')}</TableHead>
              <TableHead>{t('common.rider')}</TableHead>
              <TableHead>{t('common.city')}</TableHead>
              <TableHead className="text-end">{t('delivery.fee')}</TableHead>
              <TableHead className="text-end">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isInitialLoading ? (
              <TableSkeleton columns={8} />
            ) : list.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="p-0">
                  <EmptyState
                    icon={<Truck className="size-8" />}
                    title={t('delivery.empty')}
                    hint={hasFilters ? t('common.noResultsHint') : t('delivery.emptyHint')}
                  />
                </TableCell>
              </TableRow>
            ) : (
              list.items.map((job) => {
                const open = job.status === JobStatus.UNASSIGNED || job.status === JobStatus.ASSIGNED;
                const live = job.status === JobStatus.ACCEPTED || job.status === JobStatus.IN_TRANSIT;
                return (
                  <TableRow key={job.id}>
                    <TableCell>
                      <Link
                        href={`/admin/orders/${job.order.id}`}
                        className="font-mono text-xs font-medium hover:text-primary hover:underline"
                        dir="ltr"
                      >
                        {job.order.orderNo}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{humanise(job.jobType)}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={job.status} />
                        {job.partnerId ? (
                          <Badge variant="info" title={job.partnerRef ?? undefined}>
                            {t('delivery.courier')}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {job.scheduledStart ? (
                        <span className="text-sm">
                          {formatTime(job.scheduledStart)}
                          {job.scheduledEnd ? `–${formatTime(job.scheduledEnd)}` : ''}
                          <span className="text-muted-foreground ms-2 text-xs">
                            {formatRelative(job.scheduledStart)}
                          </span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      {job.rider ? (
                        <a className="text-sm hover:underline" href={`tel:${job.rider.phone}`}>
                          {job.rider.name ?? job.rider.phone}
                        </a>
                      ) : (
                        <span className="text-warning-foreground dark:text-warning inline-flex items-center gap-1 text-sm">
                          <AlertTriangle className="size-3.5" />
                          {t('delivery.noRider')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{cityNames[job.order.cityId] ?? `#${job.order.cityId}`}</TableCell>
                    <TableCell className="text-end tabular">{formatMoney(job.riderFee)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {/*
                          Which actions appear follows the API's own job transitions: assigning only makes
                          sense while a job is open, and a completed or cancelled job takes none of these.
                        */}
                        {open ? (
                          <Button variant="outline" size="sm" onClick={() => setAssigning(job)}>
                            <UserPlus />
                            {t('delivery.assign')}
                          </Button>
                        ) : null}
                        {job.status === JobStatus.ASSIGNED || live ? (
                          <Button variant="ghost" size="icon-sm" title={t('delivery.unassign')} onClick={() => setPending({ job, action: 'unassign' })}>
                            <UserMinus />
                          </Button>
                        ) : null}
                        {open || live ? (
                          <Button variant="ghost" size="icon-sm" title={t('delivery.fail')} onClick={() => setPending({ job, action: 'fail' })}>
                            <XCircle />
                          </Button>
                        ) : null}
                        {job.status === JobStatus.UNASSIGNED || job.status === JobStatus.FAILED ? (
                          <Button variant="ghost" size="icon-sm" title={t('delivery.redispatch')} onClick={() => setPending({ job, action: 'redispatch' })}>
                            <RotateCw />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
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

      {assigning ? <AssignRiderDialog job={assigning} onClose={() => setAssigning(null)} /> : null}

      {pending && copy ? (
        <ActionDialog
          open
          onOpenChange={(next) => !next && setPending(null)}
          title={copy.title}
          description={`${pending.job.order.orderNo} · ${humanise(pending.job.jobType)} — ${copy.body}`}
          confirmLabel={copy.confirm}
          variant={copy.variant}
          pending={mutation.isPending}
          reason={copy.needsReason ? { label: t('common.reason'), placeholder: t('delivery.failReasonPlaceholder'), minLength: 3 } : undefined}
          onConfirm={(reason) => mutation.mutate({ jobId: pending.job.id, action: pending.action, reason })}
        />
      ) : null}
    </>
  );
}
