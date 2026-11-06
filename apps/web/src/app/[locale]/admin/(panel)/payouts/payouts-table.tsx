'use client';

import { useState } from 'react';
import { Banknote, Check, CreditCard, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PayoutStatus, formatMoney, sumMoney } from '@dhoblio/shared';
import { ActionDialog } from '@/components/admin/action-dialog';
import { EnumFilter, FilterBar } from '@/components/admin/filter-bar';
import { LoadMore } from '@/components/admin/load-more';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/admin/states';
import { StatusBadge } from '@/components/admin/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { AdminPayout } from '@/lib/api/types';
import { formatDateTime, humanise } from '@/lib/format';
import { useAdminMutation } from '@/lib/hooks/use-admin-mutation';
import { useCursorList } from '@/lib/hooks/use-cursor-list';

const STATUSES = [
  PayoutStatus.REQUESTED,
  PayoutStatus.APPROVED,
  PayoutStatus.PAID,
  PayoutStatus.REJECTED,
] as const;

type PayoutAction = 'approve' | 'reject' | 'pay';

/**
 * The payout queue: vendors asking to be paid what the ledger says they have earned.
 *
 * The flow is REQUESTED → APPROVED → PAID, with REJECTED as the exit. Which buttons appear follows that,
 * because the API answers PAYOUT_INVALID_STATE for anything else.
 *
 * Paying requires a transaction reference. That is not bureaucracy: it is the only thing tying a row in
 * this table to a real bank transfer when a vendor says they were not paid.
 */
export function PayoutsTable({ initialStatus }: { initialStatus: string }) {
  const t = useTranslations();
  const [status, setStatus] = useState(initialStatus);
  const [pending, setPending] = useState<{ payout: AdminPayout; action: PayoutAction } | null>(null);

  const list = useCursorList<AdminPayout>({
    key: ['admin', 'payouts', { status }],
    path: '/admin/payouts',
    query: { status: status || undefined },
  });

  const successMessages: Record<PayoutAction, string> = {
    approve: t('payouts.approveDone'),
    reject: t('payouts.rejectDone'),
    pay: t('payouts.payDone'),
  };

  const mutation = useAdminMutation<unknown, { payoutId: string; action: PayoutAction; input: string }>({
    request: ({ payoutId, action, input }) => ({
      path: `/admin/payouts/${payoutId}/${action}`,
      options:
        action === 'reject'
          ? { body: { reason: input } }
          : action === 'pay'
            ? { body: { txnRef: input } }
            : {},
    }),
    successMessage: (_r, { action }) => successMessages[action],
    // The sidebar badge counts REQUESTED payouts, so it has to be refetched too.
    invalidate: [['admin', 'payouts']],
    onSuccess: () => setPending(null),
  });

  /*
   * Total of what is on screen, not of the whole queue: there is no count or sum endpoint, and these
   * lists are cursor-paginated. Labelled "shown" so nobody reads it as the full outstanding liability.
   */
  const shownTotal = sumMoney(list.items.map((p) => p.amount));

  const dialogCopy: Record<PayoutAction, {
    title: string;
    body: string;
    confirm: string;
    variant: 'default' | 'destructive' | 'success';
    field?: { label: string; placeholder: string; minLength: number; maxLength: number };
  }> = {
    approve: {
      title: t('payouts.approveTitle'),
      body: t('payouts.approveBody'),
      confirm: t('payouts.approve'),
      variant: 'success',
    },
    reject: {
      title: t('payouts.rejectTitle'),
      body: t('payouts.rejectBody'),
      confirm: t('payouts.reject'),
      variant: 'destructive',
      field: { label: t('common.reason'), placeholder: t('payouts.rejectReasonPlaceholder'), minLength: 3, maxLength: 300 },
    },
    pay: {
      title: t('payouts.payTitle'),
      body: t('payouts.payBody'),
      confirm: t('payouts.pay'),
      variant: 'default',
      field: { label: t('payouts.txnRef'), placeholder: t('payouts.txnRefPlaceholder'), minLength: 3, maxLength: 100 },
    },
  };
  const copy = pending ? dialogCopy[pending.action] : null;

  return (
    <>
      <FilterBar hasFilters={!!status} onClear={() => setStatus('')}>
        <EnumFilter value={status} onChange={setStatus} options={STATUSES} anyLabel={t('common.all')} ariaLabel={t('common.status')} />
      </FilterBar>

      {list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : null}

      <Card className="gap-0 overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('common.vendor')}</TableHead>
              <TableHead className="text-end">{t('common.amount')}</TableHead>
              <TableHead>{t('payouts.method')}</TableHead>
              <TableHead>{t('payouts.account')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead>{t('payouts.requested')}</TableHead>
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
                    icon={<Banknote className="size-8" />}
                    title={t('payouts.empty')}
                    hint={status ? t('common.noResultsHint') : t('payouts.emptyHint')}
                  />
                </TableCell>
              </TableRow>
            ) : (
              list.items.map((payout) => (
                <TableRow key={payout.id}>
                  <TableCell className="max-w-48 truncate font-medium">
                    {payout.vendor?.businessName ?? '—'}
                  </TableCell>
                  <TableCell className="text-end font-semibold tabular">{formatMoney(payout.amount)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{humanise(payout.method)}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap" dir="ltr">
                    {payout.accountRef}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <StatusBadge status={payout.status} />
                      {payout.txnRef ? (
                        <span className="text-muted-foreground font-mono text-[11px]" dir="ltr">
                          {payout.txnRef}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {formatDateTime(payout.requestedAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {payout.status === PayoutStatus.REQUESTED ? (
                        <>
                          <Button variant="success" size="sm" onClick={() => setPending({ payout, action: 'approve' })}>
                            <Check />
                            {t('payouts.approve')}
                          </Button>
                          <Button variant="ghost" size="icon-sm" title={t('payouts.reject')} onClick={() => setPending({ payout, action: 'reject' })}>
                            <X />
                          </Button>
                        </>
                      ) : payout.status === PayoutStatus.APPROVED ? (
                        <Button variant="default" size="sm" onClick={() => setPending({ payout, action: 'pay' })}>
                          <CreditCard />
                          {t('payouts.pay')}
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          {list.items.length > 0 ? (
            <TableFooter>
              <TableRow>
                <TableCell className="text-muted-foreground text-xs">
                  {t('payouts.shownTotal', { count: list.items.length })}
                </TableCell>
                <TableCell className="text-end font-semibold tabular">{formatMoney(shownTotal)}</TableCell>
                <TableCell colSpan={5} />
              </TableRow>
            </TableFooter>
          ) : null}
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
          description={`${pending.payout.vendor?.businessName ?? ''} · ${formatMoney(pending.payout.amount)} — ${copy.body}`}
          confirmLabel={copy.confirm}
          variant={copy.variant}
          pending={mutation.isPending}
          reason={copy.field}
          onConfirm={(input) => mutation.mutate({ payoutId: pending.payout.id, action: pending.action, input })}
        />
      ) : null}
    </>
  );
}
