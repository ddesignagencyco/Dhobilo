'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { RiderStatus } from '@dhoblio/shared';
import { EmptyState, ErrorState } from '@/components/admin/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import type { AdminRiderListItem, DeliveryJob } from '@/lib/api/types';
import { humanise } from '@/lib/format';
import { useAdminMutation } from '@/lib/hooks/use-admin-mutation';
import { useCursorList } from '@/lib/hooks/use-cursor-list';
import { cn } from '@/lib/utils';

/**
 * Pick a rider for a job.
 *
 * Only approved riders in the job's own city are offered, because the API refuses anyone else
 * (RIDER_WRONG_CITY / RIDER_NOT_ACTIVE) and a list full of choices that will be rejected is worse than a
 * short one. Riders who are online are shown first and marked — assigning an offline rider works, but
 * they will not see it until they come back, which the dispatcher needs to know before they commit.
 */
export function AssignRiderDialog({ job, onClose }: { job: DeliveryJob; onClose: () => void }) {
  const t = useTranslations();
  const [selected, setSelected] = useState<string | null>(job.rider?.id ?? null);

  const riders = useCursorList<AdminRiderListItem>({
    key: ['admin', 'riders', 'assignable', job.order.cityId],
    path: '/admin/riders',
    query: { status: RiderStatus.APPROVED, cityId: job.order.cityId },
    limit: 50,
  });

  const assign = useAdminMutation<unknown, string>({
    request: (riderId) => ({ path: `/admin/delivery/jobs/${job.id}/assign`, options: { body: { riderId } } }),
    successMessage: t('delivery.assignDone'),
    invalidate: [['admin', 'delivery']],
    onSuccess: onClose,
  });

  // Online first, then by name, so the useful choices are at the top of the list.
  const sorted = [...riders.items].sort((a, b) => {
    if (!!a.isOnline !== !!b.isOnline) return a.isOnline ? -1 : 1;
    return (a.user?.name ?? '').localeCompare(b.user?.name ?? '');
  });

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('delivery.assignTitle')}</DialogTitle>
          <DialogDescription>
            {job.order.orderNo} · {humanise(job.jobType)} — {t('delivery.assignBody')}
          </DialogDescription>
        </DialogHeader>

        {riders.isError ? <ErrorState error={riders.error} onRetry={() => void riders.refetch()} /> : null}

        <div className="max-h-72 overflow-y-auto rounded-md border">
          {riders.isInitialLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <EmptyState title={t('delivery.noRidersInCity')} hint={t('delivery.noRidersInCityHint')} />
          ) : (
            <ul className="divide-y">
              {sorted.map((rider) => (
                <li key={rider.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(rider.id)}
                    aria-pressed={selected === rider.id}
                    className={cn(
                      'flex w-full items-center gap-3 px-3 py-2.5 text-start text-sm transition-colors',
                      selected === rider.id ? 'bg-primary/10' : 'hover:bg-accent',
                    )}
                  >
                    <span className="flex-1 truncate">{rider.user?.name ?? rider.user?.phone ?? rider.id}</span>
                    <span className="text-muted-foreground font-mono text-xs" dir="ltr">
                      {rider.user?.phone}
                    </span>
                    <Badge variant={rider.isOnline ? 'success' : 'muted'}>
                      {rider.isOnline ? t('riders.onlineYes') : t('riders.onlineNo')}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selected && !sorted.find((r) => r.id === selected)?.isOnline ? (
          <p className="text-warning-foreground dark:text-warning text-xs">{t('delivery.offlineWarning')}</p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={assign.isPending}>
            {t('common.cancel')}
          </Button>
          <Button disabled={!selected || assign.isPending} onClick={() => selected && assign.mutate(selected)}>
            {assign.isPending ? <Loader2 className="animate-spin" /> : null}
            {t('delivery.assign')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
