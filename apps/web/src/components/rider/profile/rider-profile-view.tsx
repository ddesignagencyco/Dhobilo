'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function RiderProfileView() {
  const t = useTranslations('rider.profile');

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-semibold text-lg">{t('personalInfo')}</h3>
          </div>
          <Button variant="outline" size="sm">
            {t('edit')}
          </Button>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">{t('name')}</p>
            <p className="font-medium">Rider Name</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t('phone')}</p>
            <p className="font-medium">+92 300 1234567</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t('status')}</p>
            <Badge className="mt-1">{t('approved')}</Badge>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold text-lg mb-4">{t('bankDetails')}</h3>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">{t('iban')}</p>
            <p className="font-medium font-mono">PK94****4567</p>
          </div>
          <Button variant="outline" className="w-full">
            {t('updateBankDetails')}
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold text-lg mb-4">{t('preferences')}</h3>
        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" defaultChecked className="rounded" />
            <span className="text-sm">{t('pushNotifications')}</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" defaultChecked className="rounded" />
            <span className="text-sm">{t('smsNotifications')}</span>
          </label>
        </div>
      </Card>

      <Button variant="destructive" className="w-full">
        {t('logout')}
      </Button>
    </div>
  );
}
