'use client';

import { useState } from 'react';
import { Plus, Power, Ticket, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DiscountType, formatMoney, formatRatePct } from '@dhoblio/shared';
import { ActionDialog } from '@/components/admin/action-dialog';
import { CityFilter, FilterBar, SearchFilter } from '@/components/admin/filter-bar';
import { LoadMore } from '@/components/admin/load-more';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/admin/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { AdminPromo } from '@/lib/api/types';
import { formatDate } from '@/lib/format';
import { useAdminMutation } from '@/lib/hooks/use-admin-mutation';
import { useCityNames } from '@/lib/hooks/use-cities';
import { useCursorList } from '@/lib/hooks/use-cursor-list';
import { PromoDialog } from './promo-dialog';

/** A promo is live only if it is active and today sits inside its window. */
function liveState(promo: AdminPromo, now = Date.now()) {
  const from = new Date(promo.validFrom).getTime();
  const to = new Date(promo.validTo).getTime();
  if (!promo.isActive) return 'off' as const;
  if (now < from) return 'scheduled' as const;
  if (now > to) return 'expired' as const;
  if (promo.maxUses !== null && promo.redemptions >= promo.maxUses) return 'exhausted' as const;
  return 'live' as const;
}

export function PromosScreen() {
  const t = useTranslations();
  const cityNames = useCityNames();
  const [code, setCode] = useState('');
  const [cityId, setCityId] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminPromo | null>(null);
  const [toggling, setToggling] = useState<AdminPromo | null>(null);
  const [deleting, setDeleting] = useState<AdminPromo | null>(null);

  const list = useCursorList<AdminPromo>({
    key: ['admin', 'promos', { code, cityId }],
    path: '/admin/promos',
    query: { code: code || undefined, cityId: cityId || undefined },
  });

  const toggle = useAdminMutation<unknown, AdminPromo>({
    request: (promo) => ({
      path: `/admin/promos/${promo.id}`,
      options: { method: 'PATCH', body: { isActive: !promo.isActive } },
    }),
    successMessage: (_r, promo) => (promo.isActive ? t('promos.disabled') : t('promos.enabled')),
    invalidate: [['admin', 'promos']],
    onSuccess: () => setToggling(null),
  });

  const remove = useAdminMutation<unknown, string>({
    request: (id) => ({ path: `/admin/promos/${id}`, options: { method: 'DELETE' } }),
    successMessage: t('promos.deleteDone'),
    invalidate: [['admin', 'promos']],
    onSuccess: () => setDeleting(null),
  });

  const stateBadge = {
    live: 'success',
    scheduled: 'info',
    expired: 'muted',
    exhausted: 'warning',
    off: 'muted',
  } as const;

  const hasFilters = !!code || !!cityId;

  return (
    <>
      <FilterBar
        hasFilters={hasFilters}
        onClear={() => {
          setCode('');
          setCityId('');
        }}
      >
        <SearchFilter value={code} onChange={setCode} placeholder={t('promos.searchPlaceholder')} />
        <CityFilter value={cityId} onChange={setCityId} />
        <Button className="ms-auto" onClick={() => setCreating(true)}>
          <Plus />
          {t('promos.add')}
        </Button>
      </FilterBar>

      {list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : null}

      <Card className="gap-0 overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('promos.code')}</TableHead>
              <TableHead>{t('promos.discount')}</TableHead>
              <TableHead>{t('promos.conditions')}</TableHead>
              <TableHead>{t('promos.window')}</TableHead>
              <TableHead className="text-center">{t('promos.used')}</TableHead>
              <TableHead>{t('common.city')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
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
                    icon={<Ticket className="size-8" />}
                    title={t('promos.empty')}
                    hint={hasFilters ? t('common.noResultsHint') : t('promos.emptyHint')}
                    action={
                      <Button onClick={() => setCreating(true)}>
                        <Plus />
                        {t('promos.add')}
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              list.items.map((promo) => {
                const state = liveState(promo);
                return (
                  <TableRow key={promo.id}>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => setEditing(promo)}
                        className="font-mono text-sm font-semibold hover:text-primary hover:underline"
                        dir="ltr"
                      >
                        {promo.code}
                      </button>
                      {promo.owner ? (
                        <Badge variant="info" className="ms-2">
                          {t('promos.referral')}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="tabular">
                      {promo.discountType === DiscountType.PERCENT
                        ? formatRatePct(promo.value)
                        : formatMoney(promo.value)}
                      {promo.maxDiscount ? (
                        <span className="text-muted-foreground text-xs">
                          {' '}
                          {t('promos.capped', { cap: formatMoney(promo.maxDiscount) })}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {promo.minOrderAmount ? t('promos.minOrder', { amount: formatMoney(promo.minOrderAmount) }) : '—'}
                      <br />
                      {t('promos.perUser', { count: promo.perUserLimit })}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                      {formatDate(promo.validFrom)}
                      <br />
                      {formatDate(promo.validTo)}
                    </TableCell>
                    <TableCell className="text-center tabular">
                      {promo.redemptions}
                      {promo.maxUses !== null ? (
                        <span className="text-muted-foreground"> / {promo.maxUses}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>{promo.cityId ? (cityNames[promo.cityId] ?? `#${promo.cityId}`) : t('common.allCities')}</TableCell>
                    <TableCell>
                      <Badge variant={stateBadge[state]}>{t(`promos.state_${state}`)}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title={promo.isActive ? t('promos.disable') : t('promos.enable')}
                          onClick={() => setToggling(promo)}
                        >
                          <Power className={promo.isActive ? 'text-success' : 'text-muted-foreground'} />
                        </Button>
                        <Button variant="ghost" size="icon-sm" title={t('promos.delete')} onClick={() => setDeleting(promo)}>
                          <Trash2 />
                        </Button>
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

      {creating ? <PromoDialog onClose={() => setCreating(false)} /> : null}
      {editing ? <PromoDialog promo={editing} onClose={() => setEditing(null)} /> : null}

      {toggling ? (
        <ActionDialog
          open
          onOpenChange={(next) => !next && setToggling(null)}
          title={toggling.isActive ? t('promos.disableTitle') : t('promos.enableTitle')}
          description={
            toggling.isActive
              ? t('promos.disableBody', { code: toggling.code })
              : t('promos.enableBody', { code: toggling.code })
          }
          confirmLabel={toggling.isActive ? t('promos.disable') : t('promos.enable')}
          variant={toggling.isActive ? 'destructive' : 'success'}
          pending={toggle.isPending}
          onConfirm={() => toggle.mutate(toggling)}
        />
      ) : null}

      {deleting ? (
        <ActionDialog
          open
          onOpenChange={(next) => !next && setDeleting(null)}
          title={t('promos.deleteTitle')}
          description={t('promos.deleteBody', { code: deleting.code, used: deleting.redemptions })}
          confirmLabel={t('promos.delete')}
          variant="destructive"
          pending={remove.isPending}
          onConfirm={() => remove.mutate(deleting.id)}
        />
      ) : null}
    </>
  );
}
