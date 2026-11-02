'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Download, FileSpreadsheet, Loader2, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import {
  type CreateReportForm,
  type CreateReportInput,
  REPORT_FORMATS,
  REPORT_TYPES,
  createReportSchema,
  formatCount,
} from '@dhoblio/shared';
import { Field } from '@/components/admin/form';
import { LoadMore } from '@/components/admin/load-more';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/admin/states';
import { StatusBadge } from '@/components/admin/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ReportJob } from '@/lib/api/types';
import { businessDaysAgo, businessToday, formatDateTime, humanise } from '@/lib/format';
import { useAdminMutation } from '@/lib/hooks/use-admin-mutation';
import { useCities } from '@/lib/hooks/use-cities';
import { useCursorList } from '@/lib/hooks/use-cursor-list';

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function RequestDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations();
  const { data: cities } = useCities();

  const form = useForm<CreateReportForm, unknown, CreateReportInput>({
    resolver: zodResolver(createReportSchema),
    defaultValues: {
      type: 'ORDERS',
      format: 'CSV',
      from: businessDaysAgo(29),
      to: businessToday(),
    },
  });

  const create = useAdminMutation<unknown, CreateReportInput>({
    request: (input) => ({
      path: '/admin/reports',
      options: {
        body: {
          type: input.type,
          format: input.format,
          ...(input.from ? { from: input.from } : {}),
          ...(input.to ? { to: input.to } : {}),
          ...(input.cityId ? { cityId: input.cityId } : {}),
        },
      },
    }),
    successMessage: t('reports.queued'),
    invalidate: [['admin', 'reports']],
    onSuccess: onClose,
  });

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('reports.requestTitle')}</DialogTitle>
          <DialogDescription>{t('reports.requestBody')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit((values) => create.mutate(values))} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="type" label={t('reports.type')} error={form.formState.errors.type} required>
              <Select
                value={form.watch('type')}
                onValueChange={(v) => form.setValue('type', v as CreateReportForm['type'])}
              >
                <SelectTrigger id="type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {humanise(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field name="format" label={t('reports.format')} error={form.formState.errors.format}>
              <Select
                value={form.watch('format') ?? 'CSV'}
                onValueChange={(v) => form.setValue('format', v as CreateReportForm['format'])}
              >
                <SelectTrigger id="format" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_FORMATS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field name="from" label={t('common.from')} error={form.formState.errors.from}>
              <Input id="from" type="date" dir="ltr" {...form.register('from')} />
            </Field>

            <Field name="to" label={t('common.to')} error={form.formState.errors.to}>
              <Input id="to" type="date" dir="ltr" {...form.register('to')} />
            </Field>

            <Field name="cityId" label={t('common.city')} error={form.formState.errors.cityId} className="sm:col-span-2">
              <Select
                value={form.watch('cityId') ? String(form.watch('cityId')) : 'all'}
                onValueChange={(v) => form.setValue('cityId', v === 'all' ? undefined : Number(v))}
              >
                <SelectTrigger id="cityId" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.allCities')}</SelectItem>
                  {(cities ?? []).map((city) => (
                    <SelectItem key={city.id} value={String(city.id)}>
                      {city.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <p className="text-muted-foreground text-xs">{t('reports.capNote')}</p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={create.isPending}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? <Loader2 className="animate-spin" /> : null}
              {t('reports.request')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Reports are generated in the background and handed over as a short-lived signed link.
 *
 * Two consequences the screen has to be honest about:
 *  - Nobody is emailed when a report is ready (BE-8.4), so this list polls while anything is still
 *    running, which is the only way an admin finds out.
 *  - The download link is HMAC-signed and lives about ten minutes, and the file itself is deleted after
 *    seven days. An EXPIRED row cannot be downloaded — it has to be requested again.
 */
export function ReportsScreen() {
  const t = useTranslations();
  const [requesting, setRequesting] = useState(false);

  const list = useCursorList<ReportJob>({
    key: ['admin', 'reports'],
    path: '/admin/reports',
    // Poll only while a file is still being built. Nobody is emailed when a report is ready (BE-8.4),
    // so this list is how an admin finds out — but idling at 5s forever would be rude to the API.
    refetchInterval: (pages) => {
      const rows = pages?.flatMap((p) => p.items) ?? [];
      return rows.some((r) => r.status === 'QUEUED' || r.status === 'RUNNING') ? 5_000 : false;
    },
  });

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setRequesting(true)}>
          <Plus />
          {t('reports.request')}
        </Button>
      </div>

      {list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : null}

      <Card className="gap-0 overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('reports.type')}</TableHead>
              <TableHead>{t('reports.range')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead>{t('reports.rows')}</TableHead>
              <TableHead>{t('reports.size')}</TableHead>
              <TableHead>{t('reports.requested')}</TableHead>
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
                    icon={<FileSpreadsheet className="size-8" />}
                    title={t('reports.empty')}
                    hint={t('reports.emptyHint')}
                    action={
                      <Button onClick={() => setRequesting(true)}>
                        <Plus />
                        {t('reports.request')}
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              list.items.map((report) => (
                <TableRow key={report.id}>
                  <TableCell>
                    <span className="font-medium">{humanise(report.type)}</span>
                    <Badge variant="outline" className="ms-2">
                      {report.format}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap" dir="ltr">
                    {report.params?.from ?? '—'} → {report.params?.to ?? '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <StatusBadge status={report.status} />
                      {report.error ? (
                        <span className="text-destructive line-clamp-2 text-[11px]">{report.error}</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="tabular">
                    {report.rowCount !== null ? formatCount(report.rowCount) : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular">{formatBytes(report.byteSize)}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {formatDateTime(report.createdAt)}
                  </TableCell>
                  <TableCell className="text-end">
                    {report.status === 'READY' && report.download ? (
                      <Button variant="outline" size="sm" asChild>
                        {/*
                          The signed path is relative to the API, so it goes through the BFF proxy, which
                          forwards content-disposition so the browser saves it with the right name.
                        */}
                        <a href={`/api/bff${report.download.url.replace(/^\/api\/v1/, '')}`} download>
                          <Download />
                          {t('reports.download')}
                        </a>
                      </Button>
                    ) : report.status === 'EXPIRED' ? (
                      <span className="text-muted-foreground text-xs">{t('reports.expiredNote')}</span>
                    ) : report.status === 'QUEUED' || report.status === 'RUNNING' ? (
                      <Loader2 className="text-muted-foreground ms-auto size-4 animate-spin" />
                    ) : null}
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

      {requesting ? <RequestDialog onClose={() => setRequesting(false)} /> : null}
    </>
  );
}
