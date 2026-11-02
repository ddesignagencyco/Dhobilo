'use client';

import { useState } from 'react';
import { Store } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { VendorStatus } from '@dhoblio/shared';
import { Link } from '@/i18n/navigation';
import { CityFilter, EnumFilter, FilterBar, SearchFilter } from '@/components/admin/filter-bar';
import { LoadMore } from '@/components/admin/load-more';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/admin/states';
import { StatusBadge } from '@/components/admin/status-badge';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { AdminVendorListItem } from '@/lib/api/types';
import { formatDate } from '@/lib/format';
import { useCursorList } from '@/lib/hooks/use-cursor-list';
import { useCityNames } from '@/lib/hooks/use-cities';

const STATUSES = [
  VendorStatus.PENDING,
  VendorStatus.APPROVED,
  VendorStatus.REJECTED,
  VendorStatus.SUSPENDED,
] as const;

export function VendorsTable({ initialStatus }: { initialStatus: string }) {
  const t = useTranslations();
  const cityNames = useCityNames();

  const [status, setStatus] = useState(initialStatus);
  const [cityId, setCityId] = useState('');
  const [q, setQ] = useState('');

  const list = useCursorList<AdminVendorListItem>({
    // Every filter is in the key: without that, switching status would briefly show the old list's rows.
    key: ['admin', 'vendors', { status, cityId, q }],
    path: '/admin/vendors',
    query: { status: status || undefined, cityId: cityId || undefined, q: q || undefined },
  });

  const hasFilters = !!status || !!cityId || !!q;

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
        <SearchFilter value={q} onChange={setQ} placeholder={t('vendors.searchPlaceholder')} />
        <EnumFilter
          value={status}
          onChange={setStatus}
          options={STATUSES}
          anyLabel={t('common.all')}
          ariaLabel={t('common.status')}
        />
        <CityFilter value={cityId} onChange={setCityId} />
      </FilterBar>

      {list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : null}

      <Card className="gap-0 overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('vendors.business')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead>{t('common.city')}</TableHead>
              <TableHead>{t('vendors.owner')}</TableHead>
              <TableHead className="text-center">{t('vendors.documents')}</TableHead>
              <TableHead>{t('vendors.applied')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isInitialLoading ? (
              <TableSkeleton columns={6} />
            ) : list.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="p-0">
                  <EmptyState
                    icon={<Store className="size-8" />}
                    title={t('vendors.empty')}
                    hint={hasFilters ? t('common.noResultsHint') : t('vendors.emptyHint')}
                  />
                </TableCell>
              </TableRow>
            ) : (
              list.items.map((vendor) => (
                <TableRow key={vendor.id}>
                  <TableCell className="font-medium">
                    <Link href={`/admin/vendors/${vendor.id}`} className="hover:text-primary hover:underline">
                      {vendor.businessName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={vendor.status} />
                  </TableCell>
                  <TableCell>{cityNames[vendor.cityId] ?? `#${vendor.cityId}`}</TableCell>
                  <TableCell>
                    <span className="font-mono text-xs" dir="ltr">
                      {vendor.owner?.phone ?? '—'}
                    </span>
                  </TableCell>
                  <TableCell className="text-center tabular">{vendor._count?.documents ?? 0}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {formatDate(vendor.createdAt)}
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
