'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2, Send, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ANNOUNCE_CHANNELS, Role, TARGET_ROLES, formatCount } from '@dhoblio/shared';
import { Field } from '@/components/admin/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { AnnouncementPreview } from '@/lib/api/types';
import { humanise } from '@/lib/format';
import { useAdminMutation } from '@/lib/hooks/use-admin-mutation';
import { useCities } from '@/lib/hooks/use-cities';

/**
 * Compose and send an announcement.
 *
 * The flow is preview-then-send, and that is not a nicety: the API's create endpoint requires
 * `confirmRecipients` to equal the number the preview returned, and answers 409 AUDIENCE_CHANGED if the
 * audience has moved since. So the send button stays disabled until a preview has been taken, and any
 * change to the segment or channels throws the preview away rather than letting a stale count be sent.
 *
 * This is the one screen in the panel that can message tens of thousands of people at once, so the count
 * is shown large and the send dialog repeats it.
 */
export function AnnouncementComposer({ onClose }: { onClose: () => void }) {
  const t = useTranslations();
  const { data: cities } = useCities();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [titleUr, setTitleUr] = useState('');
  const [bodyUr, setBodyUr] = useState('');
  const [roles, setRoles] = useState<string[]>([Role.CUSTOMER]);
  const [cityId, setCityId] = useState<string>('');
  const [activity, setActivity] = useState<{ kind: 'any' | 'active' | 'inactive'; days: string }>({
    kind: 'any',
    days: '60',
  });
  const [channels, setChannels] = useState<string[]>(['PUSH']);
  const [preview, setPreview] = useState<AnnouncementPreview | null>(null);
  const [confirming, setConfirming] = useState(false);

  /** Any change to who or how invalidates the count the API will check against. */
  function invalidatePreview() {
    setPreview(null);
    setConfirming(false);
  }

  function buildSegment() {
    const days = Number(activity.days);
    return {
      ...(roles.length ? { roles } : {}),
      ...(cityId ? { cityId: Number(cityId) } : {}),
      ...(activity.kind === 'active' && days > 0 ? { activeWithinDays: days } : {}),
      ...(activity.kind === 'inactive' && days > 0 ? { inactiveForDays: days } : {}),
    };
  }

  const previewMutation = useAdminMutation<AnnouncementPreview, void>({
    request: () => ({
      path: '/admin/announcements/preview',
      options: { body: { segment: buildSegment(), channels } },
    }),
    successMessage: t('announcements.previewDone'),
    onSuccess: (data) => setPreview(data),
  });

  const send = useAdminMutation<unknown, void>({
    request: () => ({
      path: '/admin/announcements',
      options: {
        body: {
          title: title.trim(),
          body: body.trim(),
          ...(titleUr.trim() ? { titleUr: titleUr.trim() } : {}),
          ...(bodyUr.trim() ? { bodyUr: bodyUr.trim() } : {}),
          segment: buildSegment(),
          channels,
          // The API rejects this if the audience moved since the preview.
          confirmRecipients: preview?.recipients ?? -1,
        },
      },
    }),
    successMessage: t('announcements.sendDone'),
    invalidate: [['admin', 'announcements']],
    onSuccess: onClose,
  });

  const urduHalfFilled = !!titleUr.trim() !== !!bodyUr.trim();
  const canPreview = channels.length > 0;
  const canSend =
    !!preview && !!title.trim() && !!body.trim() && channels.length > 0 && !urduHalfFilled;

  function toggle(list: string[], value: string, setter: (next: string[]) => void) {
    setter(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
    invalidatePreview();
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('announcements.composeTitle')}</DialogTitle>
          <DialogDescription>{t('announcements.composeBody')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field name="title" label={t('announcements.titleField')} required hint={`${title.trim().length}/65`}>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={65} />
          </Field>

          <Field name="body" label={t('announcements.bodyField')} required hint={`${body.trim().length}/500`}>
            <Textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} rows={3} />
          </Field>

          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">{t('announcements.urduOptional')}</summary>
            <div className="mt-3 space-y-3">
              <Field name="titleUr" label={t('announcements.titleUr')}>
                <Input
                  id="titleUr"
                  value={titleUr}
                  onChange={(e) => setTitleUr(e.target.value)}
                  maxLength={65}
                  dir="rtl"
                  lang="ur"
                />
              </Field>
              <Field name="bodyUr" label={t('announcements.bodyUr')}>
                <Textarea
                  id="bodyUr"
                  value={bodyUr}
                  onChange={(e) => setBodyUr(e.target.value)}
                  maxLength={500}
                  rows={3}
                  dir="rtl"
                  lang="ur"
                />
              </Field>
              {urduHalfFilled ? (
                <p className="text-destructive text-xs">{t('announcements.urduBoth')}</p>
              ) : (
                <p className="text-muted-foreground text-xs">{t('announcements.urduHint')}</p>
              )}
            </div>
          </details>

          <div className="space-y-3 rounded-md border p-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Users className="size-4" />
              {t('announcements.audience')}
            </p>

            <div>
              <Label className="mb-2 text-xs">{t('announcements.roles')}</Label>
              <div className="flex flex-wrap gap-3">
                {TARGET_ROLES.map((role) => (
                  <label key={role} className="flex min-h-9 items-center gap-2 text-sm">
                    <Checkbox
                      checked={roles.includes(role)}
                      onCheckedChange={() => toggle(roles, role, setRoles)}
                    />
                    {humanise(role)}
                  </label>
                ))}
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                {roles.length === 0 ? t('announcements.noRolesMeansAll') : ''}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field name="segCity" label={t('common.city')}>
                <Select
                  value={cityId || 'all'}
                  onValueChange={(v) => {
                    setCityId(v === 'all' ? '' : v);
                    invalidatePreview();
                  }}
                >
                  <SelectTrigger id="segCity" className="w-full">
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

              <Field name="segActivity" label={t('announcements.activity')}>
                <div className="flex gap-2">
                  <Select
                    value={activity.kind}
                    onValueChange={(v) => {
                      setActivity((a) => ({ ...a, kind: v as typeof a.kind }));
                      invalidatePreview();
                    }}
                  >
                    <SelectTrigger id="segActivity" className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">{t('announcements.anyActivity')}</SelectItem>
                      <SelectItem value="active">{t('announcements.recentlyActive')}</SelectItem>
                      <SelectItem value="inactive">{t('announcements.goneQuiet')}</SelectItem>
                    </SelectContent>
                  </Select>
                  {activity.kind !== 'any' ? (
                    <Input
                      aria-label={t('announcements.days')}
                      type="number"
                      min="1"
                      max={activity.kind === 'active' ? 365 : 730}
                      value={activity.days}
                      onChange={(e) => {
                        setActivity((a) => ({ ...a, days: e.target.value }));
                        invalidatePreview();
                      }}
                      className="w-20"
                      dir="ltr"
                    />
                  ) : null}
                </div>
              </Field>
            </div>

            <div>
              <Label className="mb-2 text-xs">{t('announcements.channels')}</Label>
              <div className="flex flex-wrap gap-3">
                {ANNOUNCE_CHANNELS.map((channel) => (
                  <label key={channel} className="flex min-h-9 items-center gap-2 text-sm">
                    <Checkbox
                      checked={channels.includes(channel)}
                      onCheckedChange={() => toggle(channels, channel, setChannels)}
                    />
                    {humanise(channel)}
                  </label>
                ))}
              </div>
              {channels.length === 0 ? (
                <p className="text-destructive mt-1 text-xs">{t('announcements.pickChannel')}</p>
              ) : null}
            </div>
          </div>

          {preview ? (
            <Alert variant="info">
              <Users />
              <AlertDescription>
                <p className="text-base font-semibold">
                  {t('announcements.willReach', {
                    reachable: formatCount(preview.reachable),
                    recipients: formatCount(preview.recipients),
                  })}
                </p>
                {preview.byChannel ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {Object.entries(preview.byChannel).map(([channel, count]) => (
                      <Badge key={channel} variant="outline">
                        {humanise(channel)}: {formatCount(count)}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                <p className="text-xs">{t('announcements.optOutNote')}</p>
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <AlertTriangle />
              <AlertDescription>{t('announcements.previewFirst')}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={send.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="secondary"
            disabled={!canPreview || previewMutation.isPending}
            onClick={() => previewMutation.mutate()}
          >
            {previewMutation.isPending ? <Loader2 className="animate-spin" /> : <Users />}
            {t('announcements.preview')}
          </Button>
          <Button disabled={!canSend || send.isPending} onClick={() => setConfirming(true)}>
            <Send />
            {t('announcements.send')}
          </Button>
        </DialogFooter>

        {confirming && preview ? (
          <Dialog open onOpenChange={(next) => !next && setConfirming(false)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{t('announcements.confirmTitle')}</DialogTitle>
                <DialogDescription>
                  {t('announcements.confirmBody', {
                    reachable: formatCount(preview.reachable),
                    channels: channels.map(humanise).join(', '),
                  })}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirming(false)} disabled={send.isPending}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={() => send.mutate()} disabled={send.isPending}>
                  {send.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                  {t('announcements.sendNow')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
