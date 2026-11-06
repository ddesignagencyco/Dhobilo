'use client';

import { Clock, MapPin, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatMoney } from '@dhoblio/shared';
import { Link } from '@/i18n/navigation';
import { Monogram } from '@/components/customer/ui/monogram';
import { RatingPill } from '@/components/customer/ui/rating';
import { serviceIcon } from '@/components/customer/service-types';
import type { VendorCard as VendorCardType } from '@/lib/customer/types';

export function VendorCard({ vendor }: { vendor: VendorCardType }) {
  const t = useTranslations('customer.discovery');
  const ts = useTranslations('customer.services');

  return (
    <Link href={`/vendor/${vendor.id}`} className="bg-card hover-lift group block rounded-2xl border p-4 shadow-xs">
      <div className="flex items-start gap-3">
        <Monogram
          name={vendor.businessName}
          size="md"
          className="transition-transform duration-300 group-hover:scale-105"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <h3 dir="auto" className="line-clamp-1 text-base leading-snug font-semibold text-start">
              {vendor.businessName}
            </h3>
            <ChevronRight
              className="text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
              aria-hidden
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <RatingPill value={vendor.ratingAvg} count={vendor.ratingCount} newLabel={t('new')} />
            <span className="text-muted-foreground tabular inline-flex items-center gap-1 text-xs">
              <MapPin className="size-3.5" aria-hidden />
              {t('distance', { km: vendor.distanceKm.toFixed(1) })}
            </span>
            {vendor.minTurnaroundHours > 0 ? (
              <span className="text-muted-foreground tabular inline-flex items-center gap-1 text-xs">
                <Clock className="size-3.5" aria-hidden />
                {t('turnaroundHours', { hours: vendor.minTurnaroundHours })}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {vendor.description ? (
        <p dir="auto" className="text-muted-foreground mt-3 line-clamp-2 text-sm text-start">
          {vendor.description}
        </p>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3">
        <div className="flex flex-wrap gap-1.5">
          {vendor.serviceTypes.slice(0, 4).map((type) => {
            const Icon = serviceIcon(type);
            return (
              <span
                key={type}
                title={ts(type)}
                className="bg-muted text-muted-foreground inline-flex size-7 items-center justify-center rounded-lg"
              >
                <Icon className="size-3.5" aria-hidden />
                <span className="sr-only">{ts(type)}</span>
              </span>
            );
          })}
        </div>
        <p className="text-sm">
          <span className="text-muted-foreground text-xs">{t('from')} </span>
          <span className="tabular font-semibold">{formatMoney(vendor.minPrice)}</span>
        </p>
      </div>
    </Link>
  );
}
