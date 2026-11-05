'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useNotificationPrefs, useUpdateNotificationPrefs } from '@/lib/customer/hooks/use-notifications';
import type { NotificationPrefs } from '@/lib/customer/types';

interface NotificationPreferencesProps {
  initial: NotificationPrefs;
}

const CHANNELS: { key: keyof NotificationPrefs; labelKey: string; descriptionKey: string }[] = [
  { key: 'push', labelKey: 'push', descriptionKey: 'pushDescription' },
  { key: 'whatsapp', labelKey: 'whatsapp', descriptionKey: 'whatsappDescription' },
  { key: 'sms', labelKey: 'sms', descriptionKey: 'smsDescription' },
  { key: 'email', labelKey: 'email', descriptionKey: 'emailDescription' },
];

export function NotificationPreferences({ initial }: NotificationPreferencesProps) {
  const t = useTranslations('customer.notifications');
  const { data } = useNotificationPrefs();
  const updatePrefs = useUpdateNotificationPrefs();
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof window === 'undefined' ? 'unsupported' : 'Notification' in window ? Notification.permission : 'unsupported',
  );

  const prefs = data ?? initial;

  const toggle = (key: keyof NotificationPrefs, value: boolean) => {
    updatePrefs.mutate({ ...prefs, [key]: value });
  };

  const requestPush = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const permission = await Notification.requestPermission();
    setPushPermission(permission);
    if (permission === 'granted') toggle('push', true);
  };

  const supported = typeof window !== 'undefined' && 'Notification' in window;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bell className="text-muted-foreground size-4" aria-hidden />
          <CardTitle className="text-base">{t('title')}</CardTitle>
        </div>
        <CardDescription>{t('subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {CHANNELS.map((channel) => (
          <div key={channel.key} className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">{t(channel.labelKey)}</p>
              <p className="text-muted-foreground text-xs">{t(channel.descriptionKey)}</p>
            </div>
            <Switch
              checked={prefs[channel.key]}
              onCheckedChange={(checked) => toggle(channel.key, checked)}
              disabled={updatePrefs.isPending}
              aria-label={t(channel.labelKey)}
            />
          </div>
        ))}

        <div className="flex items-start justify-between gap-3 border-t pt-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">{t('pushTitle')}</p>
            <p className="text-muted-foreground text-xs">{t('pushPermissionHint')}</p>
          </div>
          {supported && pushPermission !== 'denied' ? (
            <Button size="sm" variant="outline" onClick={() => void requestPush()} disabled={pushPermission === 'granted'}>
              {pushPermission === 'granted' ? t('pushGranted') : t('pushEnable')}
            </Button>
          ) : supported && pushPermission === 'denied' ? (
            <Button size="sm" variant="outline" disabled>
              {t('pushDenied')}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
