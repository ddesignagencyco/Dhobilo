'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LocateFixed, Trash2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from '@/i18n/navigation';
import { vendorApiClient } from '@/lib/api/client';
import {
  type DraftDocument,
  type VendorRegistrationDraft,
  useRegistrationDraft,
} from '@/lib/vendor/hooks/use-registration-draft';
import { WizardHeader } from './wizard-header';
import { UploadConfigError, uploadVendorDocument } from './upload';

const EMPTY: VendorRegistrationDraft = {
  businessName: '',
  description: '',
  email: '',
  addressLine: '',
  cityId: '',
  lat: '',
  lng: '',
  cnic: '',
  documents: [],
};

interface City {
  id: number;
  name: string;
  nameUr: string | null;
}

type DocSlot = 'CNIC_FRONT' | 'CNIC_BACK' | 'SHOP_PHOTO';

export function RegistrationWizard({ locale }: { locale: string }) {
  const t = useTranslations('vendor.register');
  const router = useRouter();
  const { saveDraft, loadDraft, clearDraft } = useRegistrationDraft();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<VendorRegistrationDraft>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState<Record<string, number>>({});
  const uploadSeq = useRef(0);
  const fileInputs = useRef<Partial<Record<DocSlot, HTMLInputElement | null>>>({});

  const cities = useQuery({
    queryKey: ['cities'],
    queryFn: async () => (await vendorApiClient.get<City[]>('/cities')).data,
    staleTime: 1000 * 60 * 30,
  });

  useEffect(() => {
    void loadDraft()
      .then((draft) => {
        if (draft) {
          setData({ ...EMPTY, ...draft.data });
          setStep(draft.step);
        }
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, [loadDraft]);

  const persist = useCallback(
    (next: VendorRegistrationDraft, nextStep: number) => {
      void saveDraft(nextStep, next).catch(() => undefined);
    },
    [saveDraft],
  );

  const update = (patch: Partial<VendorRegistrationDraft>) => {
    const next = { ...data, ...patch };
    setData(next);
    persist(next, step);
  };

  const go = (target: number) => {
    setError(null);
    setStep(target);
    persist(data, target);
  };

  const cnicDigits = data.cnic.replace(/\D/g, '');

  function validate(forStep: number): string | null {
    if (forStep === 1) {
      if (data.businessName.trim().length < 2) return t('errors.businessName');
      if (!/^\S+@\S+\.\S+$/.test(data.email.trim())) return t('errors.email');
    }
    if (forStep === 2) {
      if (data.addressLine.trim().length < 5) return t('errors.address');
      if (!data.cityId) return t('errors.city');
      const lat = Number(data.lat);
      const lng = Number(data.lng);
      if (data.lat === '' || data.lng === '' || !(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180))
        return t('errors.location');
    }
    if (forStep === 3) {
      if (cnicDigits.length !== 13) return t('errors.cnic');
      const count = (type: DocSlot) => data.documents.filter((d) => d.type === type).length;
      if (count('CNIC_FRONT') !== 1 || count('CNIC_BACK') !== 1) return t('errors.cnicPhotos');
      if (count('SHOP_PHOTO') < 1) return t('errors.shopPhoto');
    }
    return null;
  }

  function next() {
    const problem = validate(step);
    if (problem) return setError(problem);
    go(step + 1);
  }

  function useMyLocation() {
    setError(null);
    if (!navigator.geolocation) return setError(t('errors.noGeolocation'));
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        update({
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6),
        }),
      () => setError(t('errors.geolocationDenied')),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function onFile(slot: DocSlot, file: File | undefined) {
    if (!file) return;
    setError(null);
    const id = `${slot}-${++uploadSeq.current}`;
    setUploading((u) => ({ ...u, [id]: 0 }));
    try {
      const publicId = await uploadVendorDocument(file, (percent) => setUploading((u) => ({ ...u, [id]: percent })));
      const doc: DraftDocument = { type: slot, publicId, name: file.name };
      const kept = slot === 'SHOP_PHOTO' ? data.documents : data.documents.filter((d) => d.type !== slot);
      update({ documents: [...kept, doc] });
    } catch (e) {
      if (e instanceof UploadConfigError) setError(t('errors.uploadNotConfigured'));
      else if (e instanceof Error && e.message === 'NOT_AN_IMAGE') setError(t('errors.notImage'));
      else if (e instanceof Error && e.message === 'TOO_LARGE') setError(t('errors.tooLarge'));
      else setError(t('errors.uploadFailed'));
    } finally {
      setUploading((u) => {
        const rest = { ...u };
        delete rest[id];
        return rest;
      });
    }
  }

  async function submit() {
    for (const s of [1, 2, 3]) {
      const problem = validate(s);
      if (problem) {
        setStep(s);
        return setError(problem);
      }
    }
    setSubmitting(true);
    setError(null);
    try {
      await vendorApiClient.post('/vendor/register', {
        businessName: data.businessName.trim(),
        description: data.description.trim() || undefined,
        email: data.email.trim(),
        addressLine: data.addressLine.trim(),
        cityId: Number(data.cityId),
        lat: Number(data.lat),
        lng: Number(data.lng),
        cnic: data.cnic.trim(),
        documents: data.documents.map(({ type, publicId }) => ({
          type,
          publicId,
        })),
      });
      await clearDraft().catch(() => undefined);
      router.replace('/shop/orders');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  if (!loaded) return <p className="text-muted-foreground text-sm">{t('loading')}</p>;

  const docsOf = (type: DocSlot) => data.documents.filter((d) => d.type === type);
  const uploadingNow = Object.keys(uploading).length > 0;
  const cityName = (c: City) => (locale === 'ur' && c.nameUr ? c.nameUr : c.name);

  const docRow = (slot: DocSlot, label: string, multiple: boolean) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <ul className="space-y-1">
        {docsOf(slot).map((d) => (
          <li key={d.publicId} className="bg-muted/50 flex items-center gap-2 rounded-md px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate" dir="ltr">
              {d.name}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('removeFile')}
              onClick={() =>
                update({
                  documents: data.documents.filter((x) => x.publicId !== d.publicId),
                })
              }
            >
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
      {Object.entries(uploading)
        .filter(([id]) => id.startsWith(slot))
        .map(([id, percent]) => (
          <div
            key={id}
            className="bg-muted h-2 overflow-hidden rounded-full"
            role="progressbar"
            aria-valuenow={percent}
          >
            <div className="bg-primary h-full transition-all" style={{ width: `${percent}%` }} />
          </div>
        ))}
      {multiple || docsOf(slot).length === 0 ? (
        <>
          <input
            ref={(el) => {
              fileInputs.current[slot] = el;
            }}
            id={`file-${slot}`}
            data-testid={`file-${slot}`}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture={slot === 'SHOP_PHOTO' ? undefined : 'environment'}
            className="sr-only"
            onChange={(e) => {
              void onFile(slot, e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <Button type="button" variant="outline" onClick={() => fileInputs.current[slot]?.click()}>
            <Upload className="size-4" />
            {t('chooseFile')}
          </Button>
        </>
      ) : null}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-2xl">
      <WizardHeader currentStep={step} />

      <div key={step} className="bg-card animate-fade space-y-5 rounded-xl border p-5 shadow-xs sm:p-7">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {step === 1 && (
          <>
            <div className="space-y-2">
              <Label htmlFor="businessName">{t('businessName')}</Label>
              <Input
                id="businessName"
                value={data.businessName}
                onChange={(e) => update({ businessName: e.target.value })}
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t('email')}</Label>
              <Input
                id="email"
                type="email"
                dir="ltr"
                value={data.email}
                onChange={(e) => update({ email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t('description')}</Label>
              <Textarea
                id="description"
                rows={3}
                maxLength={500}
                value={data.description}
                onChange={(e) => update({ description: e.target.value })}
              />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="space-y-2">
              <Label htmlFor="addressLine">{t('address')}</Label>
              <Input
                id="addressLine"
                value={data.addressLine}
                onChange={(e) => update({ addressLine: e.target.value })}
                maxLength={250}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cityId">{t('city')}</Label>
              <select
                id="cityId"
                value={data.cityId}
                onChange={(e) => update({ cityId: e.target.value })}
                className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
              >
                <option value="">{t('selectCity')}</option>
                {cities.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {cityName(c)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="lat">{t('lat')}</Label>
                <Input
                  id="lat"
                  inputMode="decimal"
                  dir="ltr"
                  value={data.lat}
                  onChange={(e) => update({ lat: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lng">{t('lng')}</Label>
                <Input
                  id="lng"
                  inputMode="decimal"
                  dir="ltr"
                  value={data.lng}
                  onChange={(e) => update({ lng: e.target.value })}
                />
              </div>
            </div>
            <Button type="button" variant="outline" onClick={useMyLocation}>
              <LocateFixed className="size-4" />
              {t('useMyLocation')}
            </Button>
            <p className="text-muted-foreground text-xs">{t('locationHint')}</p>
          </>
        )}

        {step === 3 && (
          <>
            <div className="space-y-2">
              <Label htmlFor="cnic">{t('cnic')}</Label>
              <Input
                id="cnic"
                inputMode="numeric"
                dir="ltr"
                placeholder="35202-1234567-1"
                value={data.cnic}
                onChange={(e) => update({ cnic: e.target.value })}
                maxLength={20}
              />
            </div>
            {docRow('CNIC_FRONT', t('cnicFront'), false)}
            {docRow('CNIC_BACK', t('cnicBack'), false)}
            {docRow('SHOP_PHOTO', t('shopPhotos'), true)}
            <p className="text-muted-foreground text-xs">{t('docsHint')}</p>
          </>
        )}

        {step === 4 && (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {(
              [
                ['businessName', data.businessName],
                ['email', data.email],
                ['address', data.addressLine],
                ['city', cities.data?.find((c) => String(c.id) === data.cityId)?.name ?? data.cityId],
                ['location', `${data.lat}, ${data.lng}`],
                ['cnic', data.cnic],
                ['documents', t('documentsCount', { count: data.documents.length })],
              ] as const
            ).map(([key, value]) => (
              <div key={key} className="min-w-0">
                <dt className="text-muted-foreground text-xs">{t(key)}</dt>
                <dd className="truncate font-medium" dir="auto">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        )}

        <div className="flex items-center justify-between gap-2 pt-2">
          <Button type="button" variant="ghost" disabled={step === 1 || submitting} onClick={() => go(step - 1)}>
            {t('back')}
          </Button>
          {step < 4 ? (
            <Button type="button" onClick={next} disabled={uploadingNow}>
              {t('next')}
            </Button>
          ) : (
            <Button type="button" onClick={submit} disabled={submitting}>
              {submitting ? t('submitting') : t('submit')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
