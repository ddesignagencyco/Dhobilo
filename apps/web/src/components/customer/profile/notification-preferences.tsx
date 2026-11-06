'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');

  // Read in an effect: the server cannot know the browser's permission, so reading it during render
  // would produce different HTML on the server and the client.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPushPermission('Notification' in window ? Notification.permission : 'unsupported');
  }, []);

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

  const supported = pushPermission !== 'unsupported';

  return (
    <section className="bg-card space-y-4 rounded-2xl border p-4 shadow-xs">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Bell className="text-muted-foreground size-4" aria-hidden />
          {t('title')}
        </h2>
        <p className="text-muted-foreground mt-1 text-xs">{t('subtitle')}</p>
      </div>
      <div className="space-y-4">
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
            <Button
              size="sm"
              variant="outline"
              onClick={() => void requestPush()}
              disabled={pushPermission === 'granted'}
            >
              {pushPermission === 'granted' ? t('pushGranted') : t('pushEnable')}
            </Button>
          ) : supported && pushPermission === 'denied' ? (
            <p className="text-warning-text bg-warning/10 max-w-[11rem] rounded-lg p-2 text-xs">{t('pushDenied')}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
