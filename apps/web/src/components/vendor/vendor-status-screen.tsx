'use client';

import { Clock, ShieldAlert, Store } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export type BlockedStatus = 'UNREGISTERED' | 'PENDING' | 'REJECTED' | 'SUSPENDED';

export function VendorStatusScreen({
  status,
  reason,
  isOwner,
}: {
  status: BlockedStatus;
  reason: string | null;
  isOwner: boolean;
}) {
  const t = useTranslations('vendor.shell.status');
  const Icon = status === 'PENDING' ? Clock : status === 'UNREGISTERED' ? Store : ShieldAlert;
  const canRegister = isOwner && (status === 'UNREGISTERED' || status === 'REJECTED');

  return (
    <div className="bg-card mx-auto mt-8 flex max-w-lg flex-col items-center gap-3 rounded-xl border p-6 text-center">
      <Icon className="text-primary size-10" aria-hidden />
      <h1 className="text-xl font-semibold">{t(`${status}.title`)}</h1>
      <p className="text-muted-foreground text-sm">{t(`${status}.body`)}</p>
      {status === 'REJECTED' && reason ? (
        <p className="bg-destructive/5 text-destructive w-full rounded-md border border-current/20 p-3 text-sm">
          <span className="font-medium">{t('reason')}</span> {reason}
        </p>
      ) : null}
      {canRegister ? (
        <Button asChild className="mt-2">
          <Link href="/shop/register">{t(`${status}.cta`)}</Link>
        </Button>
      ) : null}
    </div>
  );
}
