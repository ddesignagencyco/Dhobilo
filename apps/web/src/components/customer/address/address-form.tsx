'use client';

import { useState } from 'react';
import { LocateFixed, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCreateAddress } from '@/lib/customer/hooks/use-addresses';
import type { Address } from '@/lib/customer/types';

interface AddressFormProps {
  cityId: number;
  defaultLat: number;
  defaultLng: number;
  onCreated: (address: Address) => void;
  onCancel?: () => void;
}

export function AddressForm({ cityId, defaultLat, defaultLng, onCreated, onCancel }: AddressFormProps) {
  const t = useTranslations('customer.address');
  const createAddress = useCreateAddress();

  const [label, setLabel] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [area, setArea] = useState('');
  const [coords, setCoords] = useState({ lat: defaultLat, lng: defaultLng });
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState(false);

  const locate = () => {
    if (!('geolocation' in navigator)) {
      setLocationError(true);
      return;
    }
    setLocating(true);
    setLocationError(false);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocating(false);
      },
      () => {
        setLocationError(true);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!line1.trim()) return;
    const address = await createAddress.mutateAsync({
      label: label.trim() || undefined,
      line1: line1.trim(),
      line2: line2.trim() || undefined,
      area: area.trim() || undefined,
      cityId,
      lat: coords.lat,
      lng: coords.lng,
      isDefault: true,
    });
    onCreated(address);
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="address-label">{t('label')}</Label>
        <Input
          id="address-label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder={t('labelPlaceholder')}
          maxLength={40}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="address-line1">{t('line1')}</Label>
        <Textarea
          id="address-line1"
          value={line1}
          onChange={(event) => setLine1(event.target.value)}
          placeholder={t('line1Placeholder')}
          maxLength={200}
          required
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="address-area">{t('area')}</Label>
          <Input
            id="address-area"
            value={area}
            onChange={(event) => setArea(event.target.value)}
            placeholder={t('areaPlaceholder')}
            maxLength={80}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="address-line2">{t('landmark')}</Label>
          <Input
            id="address-line2"
            value={line2}
            onChange={(event) => setLine2(event.target.value)}
            placeholder={t('landmarkPlaceholder')}
            maxLength={120}
          />
        </div>
      </div>

      <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
        <div>
          <p className="font-medium">{t('pin')}</p>
          <p className="text-muted-foreground text-xs">
            {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={locate} disabled={locating}>
          {locating ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : <LocateFixed className="mr-2 size-4" aria-hidden />}
          {t('useLocation')}
        </Button>
      </div>

      {locationError ? (
        <Alert variant="warning">
          <AlertDescription>{t('locationError')}</AlertDescription>
        </Alert>
      ) : null}

      {createAddress.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{createAddress.error.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={createAddress.isPending || !line1.trim()}>
          {createAddress.isPending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
          {t('save')}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('cancel')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
