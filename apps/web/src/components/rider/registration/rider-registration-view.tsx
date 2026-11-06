'use client';

import { useEffect, useMemo, useState } from 'react';
import { Camera, Check, ClipboardCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Link, useRouter } from '@/i18n/navigation';
import { useCities, useRiderApplication, useRiderRegistration } from '@/lib/rider/hooks';
import { cn } from '@/lib/utils';

type Step = 'info' | 'photo' | 'review';
const STEPS: Step[] = ['info', 'photo', 'review'];

function Stepper({ step }: { step: Step }) {
  const t = useTranslations('rider.register');
  const current = STEPS.indexOf(step);
  const labels: Record<Step, string> = { info: t('stepInfo'), photo: t('stepPhoto'), review: t('review') };
  return (
    <ol className="flex items-start" aria-label={t('progress')}>
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s} className="relative flex flex-1 flex-col items-center gap-2 text-center">
            {i > 0 ? (
              <span
                aria-hidden
                className={cn(
                  'absolute top-4 end-1/2 h-0.5 w-full -translate-y-1/2 transition-colors duration-500',
                  i <= current ? 'bg-primary' : 'bg-border',
                )}
              />
            ) : null}
            <span
              className={cn(
                'relative z-10 flex size-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-all duration-500',
                done && 'border-primary bg-primary text-primary-foreground',
                active && 'border-primary bg-background text-primary ring-primary/20 ring-4',
                !done && !active && 'bg-background text-muted-foreground',
              )}
            >
              {done ? <Check className="size-4" aria-hidden /> : i + 1}
            </span>
            <span className={cn('text-xs font-medium', done || active ? 'text-foreground' : 'text-muted-foreground')}>
              {labels[s]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function RiderRegistrationView() {
  const t = useTranslations('rider.register');
  const home = useTranslations('rider.home');
  const locale = useLocale();
  const router = useRouter();

  const application = useRiderApplication();
  const cities = useCities();
  const register = useRiderRegistration();

  const [step, setStep] = useState<Step>('info');
  const [name, setName] = useState('');
  const [cnic, setCnic] = useState('');
  const [cityId, setCityId] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);

  const previewUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  if (application.isLoading) return <Skeleton className="h-72 rounded-2xl" />;

  const existing = application.data;
  if (existing && existing.status !== 'REJECTED') {
    return (
      <EmptyState
        icon={<ClipboardCheck aria-hidden />}
        title={home(`application.${existing.status}`)}
        action={
          <Button asChild variant="outline" size="lg">
            <Link href="/rider/home">{t('toJobs')}</Link>
          </Button>
        }
      />
    );
  }

  const cnicDigits = cnic.replace(/\D/g, '');
  const infoValid = name.trim().length >= 2 && cnicDigits.length === 13 && cityId !== '';
  const city = cities.data?.find((c) => String(c.id) === cityId);
  const cityName = city ? (locale === 'ur' && city.nameUr ? city.nameUr : city.name) : '';

  const submit = () => {
    if (!photo) {
      toast.error(t('photosRequired'));
      return;
    }
    register.mutate(
      { name: name.trim(), cnic: cnicDigits, cityId: Number(cityId), photo },
      {
        onSuccess: () => {
          toast.success(t('registrationSubmitted'));
          router.push('/rider/home');
        },
        onError: (e) =>
          toast.error(e instanceof Error && e.message !== 'UPLOAD_FAILED' ? e.message : t('uploadFailed')),
      },
    );
  };

  return (
    <div className="space-y-6">
      {existing?.rejectionReason ? (
        <p className="text-destructive bg-destructive/5 border-destructive/30 rounded-xl border p-3 text-sm">
          {existing.rejectionReason}
        </p>
      ) : null}

      <Stepper step={step} />

      <div key={step} className="animate-fade bg-card space-y-5 rounded-2xl border p-5 shadow-xs">
        {step === 'info' ? (
          <>
            <h3 className="font-semibold">{t('basicInfo')}</h3>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{t('name')}</span>
              <Input
                className="h-12"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('nameHint')}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{t('cnic')}</span>
              <Input
                className="tabular h-12"
                value={cnic}
                onChange={(e) => setCnic(e.target.value)}
                placeholder="12345-1234567-1"
                dir="ltr"
                inputMode="numeric"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{t('city')}</span>
              <select
                value={cityId}
                onChange={(e) => setCityId(e.target.value)}
                className="border-input bg-background focus-visible:ring-ring/50 h-12 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-[3px]"
              >
                <option value="">{t('selectCity')}</option>
                {(cities.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {locale === 'ur' && c.nameUr ? c.nameUr : c.name}
                  </option>
                ))}
              </select>
            </label>
            <Button size="lg" className="h-12 w-full" disabled={!infoValid} onClick={() => setStep('photo')}>
              {t('next')}
            </Button>
          </>
        ) : null}

        {step === 'photo' ? (
          <>
            <h3 className="font-semibold">{t('documentVerification')}</h3>
            <label className="border-input hover:bg-accent/50 flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border-2 border-dashed p-4 text-center transition-colors">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="" className="size-32 rounded-full object-cover" />
              ) : (
                <span className="bg-muted text-muted-foreground flex size-14 items-center justify-center rounded-full">
                  <Camera className="size-6" aria-hidden />
                </span>
              )}
              <span className="text-sm font-medium">{photo ? t('changePhoto') : t('uploadHint')}</span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="lg" className="h-12" onClick={() => setStep('info')}>
                {t('back')}
              </Button>
              <Button size="lg" className="h-12" disabled={!photo} onClick={() => setStep('review')}>
                {t('review')}
              </Button>
            </div>
          </>
        ) : null}

        {step === 'review' ? (
          <>
            <h3 className="font-semibold">{t('reviewInfo')}</h3>
            <dl className="divide-y text-sm">
              <div className="flex justify-between gap-3 py-3">
                <dt className="text-muted-foreground">{t('name')}</dt>
                <dd className="font-medium">{name}</dd>
              </div>
              <div className="flex justify-between gap-3 py-3">
                <dt className="text-muted-foreground">{t('cnic')}</dt>
                <dd className="tabular font-medium" dir="ltr">
                  {cnic}
                </dd>
              </div>
              <div className="flex justify-between gap-3 py-3">
                <dt className="text-muted-foreground">{t('city')}</dt>
                <dd className="font-medium">{cityName}</dd>
              </div>
              <div className="text-success-text flex items-center gap-2 py-3 font-medium">
                <Check className="size-4" aria-hidden /> {t('documentsUploaded')}
              </div>
            </dl>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="lg" className="h-12" onClick={() => setStep('photo')}>
                {t('back')}
              </Button>
              <Button size="lg" className="h-12" disabled={register.isPending} onClick={submit}>
                {register.isPending ? t('submitting') : t('completeRegistration')}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
