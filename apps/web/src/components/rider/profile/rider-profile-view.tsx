'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';

export function RiderProfileView() {
  const t = useTranslations('rider.profile');

  return (
    <Card className="p-6">
      <p className="text-muted-foreground">{t('comingSoon')}</p>
    </Card>
  );
}
