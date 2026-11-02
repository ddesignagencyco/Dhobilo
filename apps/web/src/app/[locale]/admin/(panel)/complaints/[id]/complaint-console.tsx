'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Paperclip, RefreshCw, Send, UserCheck, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { ActionDialog } from '@/components/admin/action-dialog';
import { ErrorState } from '@/components/admin/states';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { bffData } from '@/lib/api/bff';
import type { AdminComplaint } from '@/lib/api/types';
import { formatDateTime, humanise } from '@/lib/format';
import { useAdminMutation } from '@/lib/hooks/use-admin-mutation';
import { cn } from '@/lib/utils';

type Outcome = 'REFUND' | 'REDO' | 'REJECT';

const CLOSED = new Set(['RESOLVED', 'REJECTED']);

/**
 * The dispute console: the thread, the order context, and the three ways to end it.
 *
 * Resolving is final and has side effects the admin should know before they click:
 *  - REFUND goes back through the original gateway for an online order, or is recorded for the admin to
 *    pay out by hand for a cash one.
 *  - REDO creates a fresh pickup and drop job on the same order, so a rider will be dispatched again.
 *  - REJECT closes it with no money moved, and the customer sees the note.
 * The dialogs say each of these rather than leaving it to be discovered.
 */
export function ComplaintConsole({ initial }: { initial: AdminComplaint }) {
  const t = useTranslations();
  const [reply, setReply] = useState('');
  const [resolving, setResolving] = useState<Outcome | null>(null);

  // Server-rendered first, then kept live so a vendor's reply appears without a manual reload.
  const detail = useQuery({
    queryKey: ['admin', 'complaints', initial.id],
    queryFn: () => bffData<AdminComplaint>(`/admin/complaints/${initial.id}`),
    initialData: initial,
    refetchInterval: 30_000,
  });

  const complaint = detail.data ?? initial;
  const closed = CLOSED.has(complaint.status);

  const assign = useAdminMutation<unknown, void>({
    request: () => ({ path: `/admin/complaints/${complaint.id}/assign` }),
    successMessage: t('complaints.assignDone'),
    invalidate: [['admin', 'complaints']],
  });

  const sendMessage = useAdminMutation<unknown, string>({
    request: (body) => ({ path: `/admin/complaints/${complaint.id}/messages`, options: { body: { body } } }),
    successMessage: t('complaints.replyDone'),
    invalidate: [['admin', 'complaints']],
    onSuccess: () => setReply(''),
  });

  const resolve = useAdminMutation<unknown, { outcome: Outcome; note: string }>({
    request: ({ outcome, note }) => ({
      path: `/admin/complaints/${complaint.id}/resolve`,
      options: { body: { outcome, ...(note ? { note } : {}) } },
    }),
    successMessage: t('complaints.resolveDone'),
    invalidate: [['admin', 'complaints']],
    onSuccess: () => setResolving(null),
  });

  const outcomeCopy: Record<Outcome, { title: string; body: string; confirm: string; variant: 'default' | 'destructive' | 'success'; requireNote: boolean }> = {
    REFUND: { title: t('complaints.refundTitle'), body: t('complaints.refundBody'), confirm: t('complaints.refund'), variant: 'default', requireNote: false },
    REDO: { title: t('complaints.redoTitle'), body: t('complaints.redoBody'), confirm: t('complaints.redo'), variant: 'default', requireNote: false },
    REJECT: { title: t('complaints.rejectTitle'), body: t('complaints.rejectBody'), confirm: t('complaints.reject'), variant: 'destructive', requireNote: true },
  };
  const copy = resolving ? outcomeCopy[resolving] : null;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {detail.isError ? <ErrorState error={detail.error} onRetry={() => void detail.refetch()} /> : null}

        {closed ? (
          <Alert variant={complaint.status === 'RESOLVED' ? 'success' : 'warning'}>
            <CheckCircle2 />
            <AlertDescription>
              <p>{t('complaints.closedNotice', { status: humanise(complaint.status) })}</p>
              {complaint.resolution ? <p className="font-medium">{complaint.resolution}</p> : null}
            </AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{t('complaints.whatHappened')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm whitespace-pre-wrap">{complaint.description || '—'}</p>

            {complaint.attachments?.length ? (
              <div className="flex flex-wrap gap-2">
                {complaint.attachments.map((file) => (
                  <Button key={file.publicId} variant="outline" size="sm" asChild disabled={!file.signedUrl}>
                    {/* Private Cloudinary assets: noreferrer so the signed link never leaks in a header. */}
                    <a href={file.signedUrl ?? '#'} target="_blank" rel="noreferrer noopener">
                      <Paperclip />
                      {file.format?.toUpperCase() || t('complaints.attachment')}
                    </a>
                  </Button>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('complaints.thread')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!complaint.messages?.length ? (
              <p className="text-muted-foreground text-sm">{t('complaints.noMessages')}</p>
            ) : (
              <ul className="space-y-3">
                {complaint.messages.map((message) => {
                  const mine = message.authorRole === 'ADMIN';
                  return (
                    <li
                      key={message.id}
                      className={cn('rounded-lg border p-3', mine ? 'bg-primary/5 border-primary/20' : 'bg-muted/40')}
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge variant={mine ? 'default' : 'outline'}>{humanise(message.authorRole)}</Badge>
                        {message.authorName ? (
                          <span className="text-sm font-medium">{message.authorName}</span>
                        ) : null}
                        <span className="text-muted-foreground ms-auto text-xs whitespace-nowrap">
                          {formatDateTime(message.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{message.body}</p>
                    </li>
                  );
                })}
              </ul>
            )}

            {!closed ? (
              <div className="space-y-2 border-t pt-3">
                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder={t('complaints.replyPlaceholder')}
                  rows={3}
                  maxLength={1000}
                  aria-label={t('complaints.reply')}
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground text-xs">{reply.trim().length}/1000</span>
                  <Button
                    size="sm"
                    disabled={reply.trim().length < 1 || sendMessage.isPending}
                    onClick={() => sendMessage.mutate(reply.trim())}
                  >
                    {sendMessage.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                    {t('complaints.reply')}
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{t('complaints.order')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">{t('common.orderNumber')}</p>
              <Link
                href={`/admin/orders/${complaint.orderId}`}
                className="font-mono text-primary hover:underline"
                dir="ltr"
              >
                {complaint.order?.orderNo ?? complaint.orderId}
              </Link>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">{t('common.vendor')}</p>
              <p>{complaint.vendor?.businessName ?? '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">{t('common.customer')}</p>
              <p>{complaint.customer?.name ?? '—'}</p>
              {complaint.customer?.phone ? (
                <a className="font-mono text-xs text-primary hover:underline" href={`tel:${complaint.customer.phone}`} dir="ltr">
                  {complaint.customer.phone}
                </a>
              ) : null}
            </div>
            <div>
              <p className="text-muted-foreground text-xs">{t('complaints.opened')}</p>
              <p>{formatDateTime(complaint.createdAt)}</p>
            </div>
          </CardContent>
        </Card>

        {!closed ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('complaints.decide')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!complaint.assignedToId ? (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={assign.isPending}
                  onClick={() => assign.mutate()}
                >
                  {assign.isPending ? <Loader2 className="animate-spin" /> : <UserCheck />}
                  {t('complaints.takeIt')}
                </Button>
              ) : (
                <p className="text-muted-foreground text-xs">
                  {t('complaints.assignedTo', { name: complaint.assignedTo?.name ?? t('complaints.anAdmin') })}
                </p>
              )}

              <Button className="w-full" onClick={() => setResolving('REFUND')}>
                <CheckCircle2 />
                {t('complaints.refund')}
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setResolving('REDO')}>
                <RefreshCw />
                {t('complaints.redo')}
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setResolving('REJECT')}>
                <XCircle />
                {t('complaints.reject')}
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {resolving && copy ? (
        <ActionDialog
          open
          onOpenChange={(next) => !next && setResolving(null)}
          title={copy.title}
          description={copy.body}
          confirmLabel={copy.confirm}
          variant={copy.variant}
          pending={resolve.isPending}
          reason={{
            label: t('common.notes'),
            placeholder: t('complaints.notePlaceholder'),
            // The API requires 3–1000 when present, and a rejection without an explanation is indefensible.
            required: copy.requireNote,
            minLength: 3,
            maxLength: 1000,
          }}
          onConfirm={(note) => resolve.mutate({ outcome: resolving, note })}
        />
      ) : null}
    </div>
  );
}
