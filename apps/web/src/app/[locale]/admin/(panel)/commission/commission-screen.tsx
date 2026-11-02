'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Info, Percent, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CommissionScope, formatRatePct } from '@dhoblio/shared';
import { ActionDialog } from '@/components/admin/action-dialog';
import { EnumFilter, FilterBar } from '@/components/admin/filter-bar';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/admin/states';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { bffData } from '@/lib/api/bff';
import type { CommissionRule } from '@/lib/api/types';
import { formatDate, humanise } from '@/lib/format';
import { useAdminMutation } from '@/lib/hooks/use-admin-mutation';
import { CommissionRuleDialog } from './commission-rule-dialog';

const SCOPES = [CommissionScope.GLOBAL, CommissionScope.CATEGORY, CommissionScope.VENDOR] as const;

/**
 * Commission rules decide the platform's cut of every future order.
 *
 * Two things matter and are stated on screen rather than left for someone to discover:
 *  - The API resolves a rate as vendor rule, else category rule, else global. So a vendor rule silently
 *    beats a category one, which is the usual source of "why is this vendor on 10%".
 *  - A rate is fixed onto an order when the order is placed. Changing a rule never alters an existing
 *    order, which is why the effective-from date is the only safe way to schedule a change.
 */
export function CommissionScreen() {
  const t = useTranslations();
  const [scope, setScope] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<CommissionRule | null>(null);

  const rules = useQuery({
    queryKey: ['admin', 'commission-rules', { scope }],
    queryFn: () => bffData<CommissionRule[]>('/admin/commission-rules', { query: { scope: scope || undefined } }),
  });

  const remove = useAdminMutation<unknown, string>({
    request: (id) => ({ path: `/admin/commission-rules/${id}`, options: { method: 'DELETE' } }),
    successMessage: t('commission.deleteDone'),
    invalidate: [['admin', 'commission-rules']],
    onSuccess: () => setDeleting(null),
  });

  const rows = rules.data ?? [];

  function target(rule: CommissionRule): string {
    if (rule.scope === CommissionScope.VENDOR) return rule.vendor?.businessName ?? rule.vendorId ?? '—';
    if (rule.scope === CommissionScope.CATEGORY) return rule.category?.name ?? `#${rule.categoryId}`;
    return t('commission.allOrders');
  }

  return (
    <>
      <Alert variant="info" className="mb-4">
        <Info />
        <AlertDescription>
          <p>{t('commission.precedence')}</p>
          <p>{t('commission.fixedAtPlacement')}</p>
        </AlertDescription>
      </Alert>

      <FilterBar hasFilters={!!scope} onClear={() => setScope('')}>
        <EnumFilter value={scope} onChange={setScope} options={SCOPES} anyLabel={t('common.all')} ariaLabel={t('commission.scope')} />
        <Button className="ms-auto" onClick={() => setCreating(true)}>
          <Plus />
          {t('commission.add')}
        </Button>
      </FilterBar>

      {rules.isError ? <ErrorState error={rules.error} onRetry={() => void rules.refetch()} /> : null}

      <Card className="gap-0 overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('commission.scope')}</TableHead>
              <TableHead>{t('commission.appliesTo')}</TableHead>
              <TableHead className="text-end">{t('commission.rate')}</TableHead>
              <TableHead>{t('commission.effectiveFrom')}</TableHead>
              <TableHead className="text-end">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.isLoading ? (
              <TableSkeleton columns={5} />
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="p-0">
                  <EmptyState
                    icon={<Percent className="size-8" />}
                    title={t('commission.empty')}
                    hint={t('commission.emptyHint')}
                    action={
                      <Button onClick={() => setCreating(true)}>
                        <Plus />
                        {t('commission.add')}
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((rule) => {
                const future = new Date(rule.effectiveFrom) > new Date();
                return (
                  <TableRow key={rule.id}>
                    <TableCell>
                      <Badge variant={rule.scope === CommissionScope.VENDOR ? 'default' : 'outline'}>
                        {humanise(rule.scope)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-56 truncate font-medium">{target(rule)}</TableCell>
                    <TableCell className="text-end font-semibold tabular">{formatRatePct(rule.ratePct)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="text-muted-foreground">{formatDate(rule.effectiveFrom)}</span>
                      {future ? (
                        <Badge variant="info" className="ms-2">
                          {t('commission.scheduled')}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-end">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title={t('commission.delete')}
                        onClick={() => setDeleting(rule)}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {creating ? <CommissionRuleDialog onClose={() => setCreating(false)} /> : null}

      {deleting ? (
        <ActionDialog
          open
          onOpenChange={(next) => !next && setDeleting(null)}
          title={t('commission.deleteTitle')}
          description={t('commission.deleteBody', {
            scope: humanise(deleting.scope),
            target: target(deleting),
            rate: formatRatePct(deleting.ratePct),
          })}
          confirmLabel={t('commission.delete')}
          variant="destructive"
          pending={remove.isPending}
          onConfirm={() => remove.mutate(deleting.id)}
        />
      ) : null}
    </>
  );
}
