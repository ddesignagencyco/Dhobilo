'use client';

import { useState } from 'react';
import { MessageSquareWarning } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ComplaintStatus } from '@dhoblio/shared';
import { Link } from '@/i18n/navigation';
import { EnumFilter, FilterBar } from '@/components/admin/filter-bar';
import { LoadMore } from '@/components/admin/load-more';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/admin/states';
import { StatusBadge } from '@/components/admin/status-badge';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { AdminComplaint } from '@/lib/api/types';
import { formatRelative, humanise } from '@/lib/format';
import { useCursorList } from '@/lib/hooks/use-cursor-list';

const STATUSES = [
  ComplaintStatus.OPEN,
  ComplaintStatus.IN_REVIEW,
  ComplaintStatus.VENDOR_RESPONDED,
  ComplaintStatus.RESOLVED,
  ComplaintStatus.REJECTED,
] as const;

const TYPES = ['COMPLAINT', 'REDO'] as const;

export function ComplaintsTable({ initialStatus }: { initialStatus: string }) {
  const t = useTranslations();
  const [status, setStatus] = useState(initialStatus);
  const [type, setType] = useState('');

  const list = useCursorList<AdminComplaint>({
    key: ['admin', 'complaints', { status, type }],
    path: '/admin/complaints',
    query: { status: status || undefined, type: type || undefined },
  });

  const hasFilters = !!status || !!type;

  return (
    <>
      <FilterBar
        hasFilters={hasFilters}
        onClear={() => {
          setStatus('');
          setType('');
        }}
      >
        <EnumFilter value={status} onChange={setStatus} options={STATUSES} anyLabel={t('common.all')} ariaLabel={t('common.status')} width="w-44" />
        <EnumFilter value={type} onChange={setType} options={TYPES} anyLabel={t('complaints.allTypes')} ariaLabel={t('complaints.type')} width="w-36" />
      </FilterBar>

      {list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : null}

      <Card className="gap-0 overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('complaints.subject')}</TableHead>
              <TableHead>{t('complaints.type')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead>{t('common.orderNumber')}</TableHead>
              <TableHead>{t('common.vendor')}</TableHead>
              <TableHead>{t('complaints.assigned')}</TableHead>
              <TableHead>{t('complaints.opened')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isInitialLoading ? (
              <TableSkeleton columns={7} />
            ) : list.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="p-0">
                  <EmptyState
                    icon={<MessageSquareWarning className="size-8" />}
                    title={t('complaints.empty')}
                    hint={hasFilters ? t('common.noResultsHint') : t('complaints.emptyHint')}
                  />
                </TableCell>
              </TableRow>
            ) : (
              list.items.map((complaint) => (
                <TableRow key={complaint.id}>
                  <TableCell className="max-w-64">
                    <Link
                      href={`/admin/complaints/${complaint.id}`}
                      className="line-clamp-1 font-medium hover:text-primary hover:underline"
                    >
                      {complaint.subject || t('complaints.noSubject')}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={complaint.type === 'REDO' ? 'info' : 'outline'}>{humanise(complaint.type)}</Badge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={complaint.status} />
                  </TableCell>
                  <TableCell className="font-mono text-xs" dir="ltr">
                    {complaint.order?.orderNo ?? '—'}
                  </TableCell>
                  <TableCell className="max-w-40 truncate">{complaint.vendor?.businessName ?? '—'}</TableCell>
                  <TableCell>
                    {complaint.assignedTo ? (
                      <span className="text-sm">{complaint.assignedTo.name ?? t('complaints.anAdmin')}</span>
                    ) : (
                      <Badge variant="warning">{t('complaints.unassigned')}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {formatRelative(complaint.createdAt)}
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
