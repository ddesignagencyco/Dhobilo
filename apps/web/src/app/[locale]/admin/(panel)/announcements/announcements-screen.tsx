'use client';

import { useState } from 'react';
import { Megaphone, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { LoadMore } from '@/components/admin/load-more';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/admin/states';
import { StatusBadge } from '@/components/admin/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Announcement } from '@/lib/api/types';
import { formatDateTime, humanise } from '@/lib/format';
import { useCursorList } from '@/lib/hooks/use-cursor-list';
import { AnnouncementComposer } from './announcement-composer';

type Translate = (key: string, values?: Record<string, string>) => string;

function segmentSummary(segment: Record<string, unknown>, t: Translate): string {
  const parts: string[] = [];
  const roles = segment.roles as string[] | undefined;
  parts.push(roles?.length ? roles.map(humanise).join(', ') : t('announcements.everyone'));
  if (segment.cityId) parts.push(t('announcements.cityNo', { id: String(segment.cityId) }));
  if (segment.activeWithinDays) parts.push(t('announcements.activeWithin', { days: String(segment.activeWithinDays) }));
  if (segment.inactiveForDays) parts.push(t('announcements.inactiveFor', { days: String(segment.inactiveForDays) }));
  return parts.join(' · ');
}

export function AnnouncementsScreen() {
  const t = useTranslations();
  const [composing, setComposing] = useState(false);

  const list = useCursorList<Announcement>({
    key: ['admin', 'announcements'],
    path: '/admin/announcements',
    // A send that is still fanning out should be seen finishing.
    refetchInterval: 15_000,
  });

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setComposing(true)}>
          <Plus />
          {t('announcements.compose')}
        </Button>
      </div>

      {list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : null}

      <Card className="gap-0 overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('announcements.message')}</TableHead>
              <TableHead>{t('announcements.audience')}</TableHead>
              <TableHead>{t('announcements.channels')}</TableHead>
              <TableHead className="text-end">{t('announcements.reach')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead>{t('announcements.sent')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isInitialLoading ? (
              <TableSkeleton columns={6} />
            ) : list.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="p-0">
                  <EmptyState
                    icon={<Megaphone className="size-8" />}
                    title={t('announcements.empty')}
                    hint={t('announcements.emptyHint')}
                    action={
                      <Button onClick={() => setComposing(true)}>
                        <Plus />
                        {t('announcements.compose')}
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              list.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="max-w-72">
                    <p className="font-medium">{item.title}</p>
                    <p className="text-muted-foreground line-clamp-2 text-xs">{item.body}</p>
                    {item.titleUr ? (
                      <Badge variant="outline" className="mt-1">
                        {t('announcements.hasUrdu')}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-48 text-xs">
                    {segmentSummary(item.segment ?? {}, t)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {item.channels?.map((channel) => (
                        <Badge key={channel} variant="outline">
                          {humanise(channel)}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-end tabular">
                    {/*
                      Two different numbers: how many people matched the segment, and how many messages
                      were actually queued after per-channel opt-outs. Showing only the first would
                      overstate the reach.
                    */}
                    <span className="font-medium">{item.messagesQueued}</span>
                    <span className="text-muted-foreground"> / {item.recipientCount}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <StatusBadge status={item.status} />
                      {item.error ? (
                        <span className="text-destructive line-clamp-2 text-[11px]">{item.error}</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {formatDateTime(item.completedAt ?? item.createdAt)}
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

      {composing ? <AnnouncementComposer onClose={() => setComposing(false)} /> : null}
    </>
  );
}
