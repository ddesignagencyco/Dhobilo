'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatMoney } from '@dhoblio/shared';
import { ActionDialog } from '@/components/admin/action-dialog';
import { ErrorState, TableSkeleton } from '@/components/admin/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { bffData } from '@/lib/api/bff';
import type { AdminCity, CourierPartner } from '@/lib/api/types';
import { useAdminMutation } from '@/lib/hooks/use-admin-mutation';
import { CityDialog } from './city-dialog';

/**
 * Cities and their operational settings.
 *
 * The list comes from GET /admin/cities, which includes the inactive ones the public GET /cities hides —
 * a paused city is exactly the one an admin has come here to switch back on.
 *
 * Switching a city off is the closest thing the platform has to a kill switch: it disappears from
 * discovery and no new addresses or vendors can be added to it, so the dialog says that plainly.
 */
export function CitiesScreen() {
  const t = useTranslations();
  const [editing, setEditing] = useState<AdminCity | null>(null);
  const [toggling, setToggling] = useState<AdminCity | null>(null);

  const cities = useQuery({
    queryKey: ['admin', 'cities'],
    queryFn: () => bffData<AdminCity[]>('/admin/cities'),
  });

  const partners = useQuery({
    queryKey: ['admin', 'courier-partners'],
    queryFn: () => bffData<CourierPartner[]>('/admin/courier-partners'),
  });

  const toggle = useAdminMutation<unknown, AdminCity>({
    request: (city) => ({
      path: `/admin/cities/${city.id}`,
      options: { method: 'PATCH', body: { isActive: !city.isActive } },
    }),
    successMessage: (_r, city) => (city.isActive ? t('cities.pausedDone') : t('cities.resumedDone')),
    // Changing a city invalidates the public list the filters everywhere else are built from.
    invalidate: [['admin', 'cities'], ['cities']],
    onSuccess: () => setToggling(null),
  });

  const rows = cities.data ?? [];

  return (
    <>
      {cities.isError ? <ErrorState error={cities.error} onRetry={() => void cities.refetch()} /> : null}

      <Card className="gap-0 overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('cities.city')}</TableHead>
              <TableHead>{t('cities.code')}</TableHead>
              <TableHead className="text-end">{t('cities.deliveryFee')}</TableHead>
              <TableHead className="text-center">{t('cities.vendors')}</TableHead>
              <TableHead>{t('cities.delivery')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead className="text-end">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cities.isLoading ? (
              <TableSkeleton columns={7} />
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground py-10 text-center">
                  <Building2 className="mx-auto mb-2 size-8 opacity-60" />
                  {t('cities.empty')}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((city) => (
                <TableRow key={city.id}>
                  <TableCell className="font-medium">
                    {city.name}
                    {city.nameUr ? (
                      <span className="text-muted-foreground ms-2 text-sm" lang="ur" dir="rtl">
                        {city.nameUr}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {city.code ? (
                      <code className="font-mono text-xs" dir="ltr">
                        {city.code}
                      </code>
                    ) : (
                      <Badge variant="warning">{t('cities.noCode')}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-end tabular">{formatMoney(city.deliveryFee)}</TableCell>
                  <TableCell className="text-center tabular">{city._count?.vendors ?? 0}</TableCell>
                  <TableCell>
                    {city.courierPartner ? (
                      <Badge variant={city.courierPartner.isActive ? 'info' : 'muted'}>
                        {city.courierPartner.name}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">{t('cities.ownRiders')}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={city.isActive ? 'success' : 'muted'}>
                      {city.isActive ? t('cities.live') : t('cities.paused')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" title={t('cities.edit')} onClick={() => setEditing(city)}>
                        <Pencil />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setToggling(city)}>
                        {city.isActive ? t('cities.pause') : t('cities.resume')}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {editing ? (
        <CityDialog city={editing} partners={partners.data ?? []} onClose={() => setEditing(null)} />
      ) : null}

      {toggling ? (
        <ActionDialog
          open
          onOpenChange={(next) => !next && setToggling(null)}
          title={toggling.isActive ? t('cities.pauseTitle') : t('cities.resumeTitle')}
          description={
            toggling.isActive
              ? t('cities.pauseBody', { name: toggling.name, vendors: toggling._count?.vendors ?? 0 })
              : t('cities.resumeBody', { name: toggling.name })
          }
          confirmLabel={toggling.isActive ? t('cities.pause') : t('cities.resume')}
          variant={toggling.isActive ? 'destructive' : 'success'}
          pending={toggle.isPending}
          onConfirm={() => toggle.mutate(toggling)}
        />
      ) : null}
    </>
  );
}
