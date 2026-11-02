'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, RotateCw, Server } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatCount } from '@dhoblio/shared';
import { ActionDialog } from '@/components/admin/action-dialog';
import { ErrorState } from '@/components/admin/states';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { bffData } from '@/lib/api/bff';
import type { QueueHealth, QueuesReport } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';
import { useAdminMutation } from '@/lib/hooks/use-admin-mutation';

/**
 * Background queue health. Super-admin only, matching the API's fail-closed rule for a route with no
 * area tag.
 *
 * "Retry failed" re-queues the jobs that exhausted their attempts. It is safe because every handler is
 * idempotent — that is a deliberate property of the worker, not an assumption this screen makes — but it
 * is still bulk work against live infrastructure, so it is confirmed first and audited server-side.
 */
function QueueCard({ queue }: { queue: QueueHealth }) {
  const t = useTranslations();
  const [retrying, setRetrying] = useState(false);

  const retry = useAdminMutation<unknown, void>({
    request: () => ({ path: `/admin/queues/${queue.queue}/retry-failed` }),
    successMessage: t('queues.retryDone', { queue: queue.queue }),
    invalidate: [['admin', 'queues']],
    onSuccess: () => setRetrying(false),
  });

  const counters = [
    { label: t('queues.waiting'), value: queue.waiting, warn: queue.waiting >= 1000 },
    { label: t('queues.active'), value: queue.active, warn: false },
    { label: t('queues.delayed'), value: queue.delayed, warn: false },
    { label: t('queues.failed'), value: queue.failed, warn: queue.failed >= 10 },
    { label: t('queues.stuck'), value: queue.stuck, warn: queue.stuck > 0 },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm">{queue.queue}</span>
          {queue.healthy ? (
            <Badge variant="success">
              <CheckCircle2 />
              {t('queues.healthy')}
            </Badge>
          ) : (
            <Badge variant="destructive">
              <AlertTriangle />
              {t('queues.unhealthy')}
            </Badge>
          )}
          {queue.failed > 0 ? (
            <Button
              variant="outline"
              size="sm"
              className="ms-auto"
              onClick={() => setRetrying(true)}
              disabled={retry.isPending}
            >
              <RotateCw />
              {t('queues.retry')}
            </Button>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid grid-cols-5 gap-2">
          {counters.map((counter) => (
            <div key={counter.label}>
              <dt className="text-muted-foreground text-[11px]">{counter.label}</dt>
              <dd
                className={
                  counter.warn ? 'text-destructive text-lg font-semibold tabular' : 'text-lg font-semibold tabular'
                }
              >
                {formatCount(counter.value)}
              </dd>
            </div>
          ))}
        </dl>

        {queue.oldestWaitingSec > 0 ? (
          <p className="text-muted-foreground text-xs">
            {t('queues.oldestWaiting', { seconds: formatCount(queue.oldestWaitingSec) })}
          </p>
        ) : null}

        {queue.recentFailures?.length ? (
          <div>
            <p className="text-muted-foreground mb-1 text-xs">{t('queues.recentFailures')}</p>
            <ul className="space-y-1">
              {queue.recentFailures.slice(0, 5).map((failure) => (
                <li key={failure.id} className="bg-muted/50 rounded-md px-2 py-1.5 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="font-mono">{failure.name}</code>
                    <span className="text-muted-foreground">
                      {t('queues.attempts', { count: failure.attemptsMade })}
                    </span>
                    <span className="text-muted-foreground ms-auto">{formatDateTime(failure.failedAt)}</span>
                  </div>
                  <p className="text-destructive mt-0.5 line-clamp-2">{failure.reason}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>

      {retrying ? (
        <ActionDialog
          open
          onOpenChange={setRetrying}
          title={t('queues.retryTitle')}
          description={t('queues.retryBody', { count: queue.failed, queue: queue.queue })}
          confirmLabel={t('queues.retry')}
          pending={retry.isPending}
          onConfirm={() => retry.mutate()}
        />
      ) : null}
    </Card>
  );
}

export function QueuesScreen() {
  const t = useTranslations();

  const report = useQuery({
    queryKey: ['admin', 'queues'],
    queryFn: () => bffData<QueuesReport>('/admin/queues'),
    // Short interval on purpose: this is the screen someone opens when things are going wrong.
    refetchInterval: 10_000,
  });

  if (report.isError) {
    return <ErrorState error={report.error} onRetry={() => void report.refetch()} />;
  }

  if (report.isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    );
  }

  const queues = report.data?.queues ?? [];
  const unhealthy = queues.filter((q) => !q.healthy);

  return (
    <>
      {report.data?.healthy ? (
        <Alert variant="success" className="mb-4">
          <CheckCircle2 />
          <AlertTitle>{t('queues.allHealthy')}</AlertTitle>
          <AlertDescription>{t('queues.allHealthyBody', { count: queues.length })}</AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle />
          <AlertTitle>{t('queues.someUnhealthy', { count: unhealthy.length })}</AlertTitle>
          <AlertDescription>
            {t('queues.someUnhealthyBody', { names: unhealthy.map((q) => q.queue).join(', ') })}
          </AlertDescription>
        </Alert>
      )}

      {queues.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center">
            <Server className="size-8 opacity-60" />
            {t('queues.empty')}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Unhealthy first: when something is broken it should not need scrolling to. */}
          {[...queues].sort((a, b) => Number(a.healthy) - Number(b.healthy)).map((queue) => (
            <QueueCard key={queue.queue} queue={queue} />
          ))}
        </div>
      )}

      <p className="text-muted-foreground mt-4 text-xs">{t('queues.dlqNote')}</p>
    </>
  );
}
