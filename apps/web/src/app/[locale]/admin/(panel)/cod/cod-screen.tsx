'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Banknote, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatMoney, sumMoney } from '@dhoblio/shared';
import { Link } from '@/i18n/navigation';
import { ActionDialog } from '@/components/admin/action-dialog';
import { SearchFilter } from '@/components/admin/filter-bar';
import { LoadMore } from '@/components/admin/load-more';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/admin/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { bffData } from '@/lib/api/bff';
import type { CodBalance, CodCollection } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';
import { useAdminMutation } from '@/lib/hooks/use-admin-mutation';
import { useCursorList } from '@/lib/hooks/use-cursor-list';

/**
 * Cash on delivery: what riders are holding, and what they have handed in.
 *
 * The important behaviour to understand before changing anything here: recording a rider's deposit is
 * what credits the vendor for a cash order. Until an admin does it, the vendor sees the money as
 * "awaiting cash" and cannot withdraw it. So the settle button on this screen moves real money, and the
 * dialog says so.
 */
function BalancesTab() {
  const t = useTranslations();
  const [q, setQ] = useState('');
  const [settling, setSettling] = useState<CodBalance | null>(null);

  const balances = useQuery({
    queryKey: ['admin', 'cod', 'balances', q],
    queryFn: () => bffData<CodBalance[]>('/admin/cod/balances', { query: { q: q || undefined } }),
  });

  const settle = useAdminMutation<unknown, { riderId: string; reference: string }>({
    request: ({ riderId, reference }) => ({
      path: '/admin/cod/settlements',
      options: { body: { riderId, ...(reference ? { reference } : {}) } },
    }),
    successMessage: t('cod.settleDone'),
    invalidate: [['admin', 'cod']],
    onSuccess: () => setSettling(null),
  });

  const rows = balances.data ?? [];
  const total = sumMoney(rows.map((r) => r.amount));

  return (
    <>
      <div className="mb-4">
        <SearchFilter value={q} onChange={setQ} placeholder={t('cod.searchPlaceholder')} />
      </div>

      {balances.isError ? <ErrorState error={balances.error} onRetry={() => void balances.refetch()} /> : null}

      <Card className="gap-0 overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('common.rider')}</TableHead>
              <TableHead>{t('common.phone')}</TableHead>
              <TableHead className="text-center">{t('cod.orders')}</TableHead>
              <TableHead className="text-end">{t('cod.holding')}</TableHead>
              <TableHead className="text-end">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {balances.isLoading ? (
              <TableSkeleton columns={5} />
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="p-0">
                  <EmptyState
                    icon={<Wallet className="size-8" />}
                    title={t('cod.noBalances')}
                    hint={q ? t('common.noResultsHint') : t('cod.noBalancesHint')}
                  />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.riderId}>
                  <TableCell className="font-medium">{row.name ?? row.riderId}</TableCell>
                  <TableCell>
                    <a className="font-mono text-xs text-primary hover:underline" href={`tel:${row.phone}`} dir="ltr">
                      {row.phone ?? '—'}
                    </a>
                  </TableCell>
                  <TableCell className="text-center tabular">{row.orders}</TableCell>
                  <TableCell className="text-end font-semibold tabular">{formatMoney(row.amount)}</TableCell>
                  <TableCell className="text-end">
                    <Button variant="outline" size="sm" onClick={() => setSettling(row)}>
                      {t('cod.settle')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          {rows.length > 0 ? (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground text-xs">
                  {t('cod.totalHeld')}
                </TableCell>
                <TableCell className="text-end font-semibold tabular">{formatMoney(total)}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
      </Card>

      {settling ? (
        <ActionDialog
          open
          onOpenChange={(next) => !next && setSettling(null)}
          title={t('cod.settleTitle')}
          description={t('cod.settleBody', {
            name: settling.name ?? '',
            amount: formatMoney(settling.amount),
            orders: settling.orders,
          })}
          confirmLabel={t('cod.settleConfirm')}
          pending={settle.isPending}
          // The deposit slip number is optional server-side, so do not block on it — but ask, because it
          // is the only link between this record and the bank.
          reason={{
            label: t('cod.reference'),
            placeholder: t('cod.referencePlaceholder'),
            required: false,
            maxLength: 100,
          }}
          onConfirm={(reference) => settle.mutate({ riderId: settling.riderId, reference })}
        />
      ) : null}
    </>
  );
}

function CollectionsTab() {
  const t = useTranslations();
  const [settled, setSettled] = useState<'' | 'true' | 'false'>('');

  const list = useCursorList<CodCollection>({
    key: ['admin', 'cod', 'collections', { settled }],
    path: '/admin/cod/collections',
    query: { settled: settled || undefined },
    limit: 50,
  });

  return (
    <>
      <div className="mb-4 flex gap-2">
        {([
          ['', t('common.all')],
          ['false', t('cod.notDeposited')],
          ['true', t('cod.deposited')],
        ] as const).map(([value, label]) => (
          <Button
            key={value || 'all'}
            variant={settled === value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSettled(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : null}

      <Card className="gap-0 overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('common.orderNumber')}</TableHead>
              <TableHead>{t('common.rider')}</TableHead>
              <TableHead className="text-end">{t('common.amount')}</TableHead>
              <TableHead>{t('cod.collected')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isInitialLoading ? (
              <TableSkeleton columns={5} />
            ) : list.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="p-0">
                  <EmptyState icon={<Banknote className="size-8" />} title={t('cod.noCollections')} />
                </TableCell>
              </TableRow>
            ) : (
              list.items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link
                      href={`/admin/orders/${row.orderId}`}
                      className="font-mono text-xs whitespace-nowrap hover:text-primary hover:underline"
                      dir="ltr"
                    >
                      {row.orderNo}
                    </Link>
                  </TableCell>
                  <TableCell>{row.riderName ?? row.riderId}</TableCell>
                  <TableCell className="text-end tabular">{formatMoney(row.amount)}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {formatDateTime(row.collectedAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.settlementId ? 'success' : 'warning'}>
                      {row.settlementId ? t('cod.deposited') : t('cod.notDeposited')}
                    </Badge>
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
    </>
  );
}

export function CodScreen() {
  const t = useTranslations('cod');
  return (
    <Tabs defaultValue="balances">
      <TabsList className="mb-4">
        <TabsTrigger value="balances">{t('tabBalances')}</TabsTrigger>
        <TabsTrigger value="collections">{t('tabCollections')}</TabsTrigger>
      </TabsList>
      <TabsContent value="balances">
        <BalancesTab />
      </TabsContent>
      <TabsContent value="collections">
        <CollectionsTab />
      </TabsContent>
    </Tabs>
  );
}
