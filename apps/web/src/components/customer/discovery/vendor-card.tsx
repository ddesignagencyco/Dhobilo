'use client';

import { MapPin, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatMoney } from '@dhoblio/shared';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import type { VendorCard as VendorCardType } from '@/lib/customer/types';

export function VendorCard({ vendor }: { vendor: VendorCardType }) {
  const t = useTranslations('customer.discovery');

  return (
    <Link href={`/vendor/${vendor.id}`} className="block">
      <div className="bg-card hover:shadow-md group relative overflow-hidden rounded-lg border p-4 transition-all">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 text-base font-semibold">{vendor.businessName}</h3>
          {vendor.minTurnaroundHours > 0 ? (
            <Badge variant="muted">{t('turnaroundHours', { hours: vendor.minTurnaroundHours })}</Badge>
          ) : null}
        </div>

        {vendor.description ? (
          <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">{vendor.description}</p>
        ) : null}

        <div className="mt-2 flex items-center gap-1">
          <Star className="size-4 fill-yellow-400 text-yellow-400" aria-hidden />
          <span className="text-sm font-medium">{vendor.ratingAvg.toFixed(1)}</span>
          <span className="text-muted-foreground text-xs">({vendor.ratingCount})</span>
        </div>

        <div className="text-muted-foreground mt-3 flex flex-col gap-1 text-sm">
          <span className="flex items-center gap-1">
            <MapPin className="size-4" aria-hidden />
            {t('distance', { km: vendor.distanceKm.toFixed(1) })}
          </span>
          <span>{t('startingFrom', { price: formatMoney(vendor.minPrice) })}</span>
        </div>
      </div>
    </Link>
  );
}
