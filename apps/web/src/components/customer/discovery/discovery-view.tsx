'use client';

import { useCallback, useState } from 'react';
import { MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useAddresses } from '@/lib/customer/hooks/use-addresses';
import type { DiscoveryFilters } from '@/lib/customer/hooks/use-discovery';
import { VendorList } from './vendor-list';

interface Coords {
  lat: number;
  lng: number;
}

function readCityId(): number | undefined {
  const match = document.cookie.split('; ').find((row) => row.startsWith('dh_city='));
  const raw = match?.split('=')[1];
  if (!raw || raw === 'none') return undefined;
  const id = Number(raw);
  return Number.isFinite(id) ? id : undefined;
}

export function DiscoveryView({ filters, limit }: { filters: DiscoveryFilters; limit?: number }) {
  const t = useTranslations('customer.discovery');
  const addresses = useAddresses();
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);
  const [denied, setDenied] = useState(false);
  const [cityId] = useState<number | undefined>(() => (typeof document === 'undefined' ? undefined : readCityId()));

  const defaultAddress = addresses.data?.find((address) => address.isDefault) ?? addresses.data?.[0];
  const addressCoords = defaultAddress ? { lat: Number(defaultAddress.lat), lng: Number(defaultAddress.lng) } : null;
  const effectiveCoords = coords ?? addressCoords;

  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setDenied(true);
      return;
    }
    setLocating(true);
    setDenied(false);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocating(false);
      },
      () => {
        setDenied(true);
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60 * 1000 },
    );
  }, []);

  if (addresses.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {Array.from({ length: limit ?? 4 }).map((_, index) => (
          <Skeleton key={index} className="h-40 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!effectiveCoords) {
    return (
      <EmptyState
        icon={<MapPin aria-hidden />}
        title={t('locationTitle')}
        description={denied ? t('locationDenied') : t('locationBody')}
        action={
          <Button onClick={locate} disabled={locating}>
            {locating ? t('locating') : t('useLocation')}
          </Button>
        }
      />
    );
  }

  return (
    <VendorList lat={effectiveCoords.lat} lng={effectiveCoords.lng} filters={{ ...filters, cityId }} limit={limit} />
  );
}
