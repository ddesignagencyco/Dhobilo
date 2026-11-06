'use client';

import { useState } from 'react';
import { Camera, Check, Copy, KeyRound, Navigation, TriangleAlert } from 'lucide-react';
import { formatMoney } from '@dhoblio/shared';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import {
  type DeliveryJob,
  type JobParty,
  uploadRiderImage,
  useRiderJob,
  useRiderJobAction,
  useRiderJobComplete,
  useRiderJobFail,
} from '@/lib/rider/hooks';
import { cn } from '@/lib/utils';
import { JobMeta, JobTypeChip } from './job-card-parts';

const STEP_INDEX: Partial<Record<DeliveryJob['status'], number>> = { ACCEPTED: 0, IN_TRANSIT: 1, COMPLETED: 2 };

function mapsUrl(party: JobParty): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${party.lat},${party.lng}`;
}

function StepTracker({ job }: { job: DeliveryJob }) {
  const t = useTranslations('rider.job');
  const current = STEP_INDEX[job.status] ?? -1;
  const steps = [
    t('stepAccepted'),
    t('stepOnTheWay'),
    job.jobType === 'PICKUP' ? t('stepPickedUp') : t('stepDelivered'),
  ];
  return (
    <ol className="flex items-start" aria-label={t('progress')}>
      {steps.map((label, i) => {
        const done = i < current || job.status === 'COMPLETED';
        const active = i === current && job.status !== 'COMPLETED';
        return (
          <li key={label} className="relative flex flex-1 flex-col items-center gap-2 text-center">
            {i > 0 ? (
              <span
                aria-hidden
                className={cn(
                  'absolute top-4 end-1/2 h-0.5 w-full -translate-y-1/2 transition-colors duration-500',
                  i <= current || job.status === 'COMPLETED' ? 'bg-primary' : 'bg-border',
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
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function StopCard({ title, party, highlight }: { title: string; party: JobParty; highlight: boolean }) {
  const t = useTranslations('rider.job');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(party.address);
      toast.success(t('copied'));
    } catch {
      toast.error(t('copyFailed'));
    }
  };
  return (
    <section
      className={cn('bg-card space-y-3 rounded-2xl border p-4 shadow-xs', highlight && 'border-primary/50 border-2')}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{title}</p>
        <Badge variant="muted">{party.role === 'CUSTOMER' ? t('roleCustomer') : t('roleShop')}</Badge>
      </div>
      <div className="min-w-0">
        <p className="text-lg font-semibold">{party.name}</p>
        <p className="text-muted-foreground mt-0.5 text-sm break-words">{party.address}</p>
        <p className="tabular text-muted-foreground mt-1 text-sm" dir="ltr">
          {party.phone}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button asChild variant={highlight ? 'default' : 'outline'} className="h-12">
          <a href={mapsUrl(party)} target="_blank" rel="noreferrer">
            <Navigation className="size-4" aria-hidden />
            {t('openMaps')}
          </a>
        </Button>
        <Button variant="outline" className="h-12" onClick={() => void copy()}>
          <Copy className="size-4" aria-hidden />
          {t('copyAddress')}
        </Button>
      </div>
    </section>
  );
}

function CodeBoxes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTranslations('rider.job');
  return (
    <label className="relative block">
      <span className="sr-only">{t('enterOtp')}</span>
      <div className="flex justify-center gap-3" dir="ltr" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              'tabular flex size-14 items-center justify-center rounded-xl border-2 text-2xl font-semibold transition-colors',
              i === value.length ? 'border-primary ring-primary/20 ring-4' : 'border-input',
              value[i] && 'bg-accent',
            )}
          >
            {value[i] ?? ''}
          </span>
        ))}
      </div>
      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={4}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
        className="absolute inset-0 h-full w-full opacity-0"
        dir="ltr"
      />
    </label>
  );
}

function SuccessPanel({ job }: { job: DeliveryJob }) {
  const t = useTranslations('rider.job');
  return (
    <div className="animate-pop flex flex-col items-center gap-4 rounded-3xl border p-8 text-center">
      <span className="bg-success/15 text-success relative flex size-20 items-center justify-center rounded-full">
        <span
          className="bg-success/20 absolute inset-0 animate-ping rounded-full [animation-iteration-count:2]"
          aria-hidden
        />
        <Check className="relative size-10" strokeWidth={3} aria-hidden />
      </span>
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold">{t('jobCompleted')}</h2>
        <p className="text-muted-foreground text-sm">{t('earnedForJob', { amount: formatMoney(job.riderFee) })}</p>
      </div>
      <Button asChild size="lg" className="h-12 w-full">
        <Link href="/rider/home">{t('backToJobs')}</Link>
      </Button>
    </div>
  );
}

const FAIL_REASONS = ['reasonUnreachable', 'reasonWrongAddress', 'reasonRefused', 'reasonClosed'] as const;

export function RiderJobDetailView({ jobId, embedded = false }: { jobId: string; embedded?: boolean }) {
  const t = useTranslations('rider.job');
  const home = useTranslations('rider.home');
  const { data: job, isLoading, isError } = useRiderJob(jobId);
  const action = useRiderJobAction();
  const complete = useRiderJobComplete();
  const fail = useRiderJobFail();

  const [proofType, setProofType] = useState<'PHOTO' | 'OTP'>('OTP');
  const [otp, setOtp] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [failReason, setFailReason] = useState('');
  const [showFail, setShowFail] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-44 rounded-2xl" />
        <Skeleton className="h-44 rounded-2xl" />
      </div>
    );
  }
  if (isError || !job) {
    return (
      <EmptyState
        icon={<TriangleAlert aria-hidden />}
        title={t('notFound')}
        action={
          <Button asChild variant="outline" size="lg">
            <Link href="/rider/home">{t('backToJobs')}</Link>
          </Button>
        }
      />
    );
  }

  const onError = (e: unknown) => toast.error(e instanceof Error ? e.message : t('failed'));
  const busy = action.isPending || complete.isPending || fail.isPending || uploading;
  const types = job.proof.types;
  const activeProof = types.includes(proofType) ? proofType : (types[0] ?? 'OTP');

  const handleComplete = async () => {
    try {
      if (!job.proof.required) {
        await complete.mutateAsync({ jobId });
      } else if (activeProof === 'OTP') {
        await complete.mutateAsync({ jobId, otp });
      } else if (photo) {
        setUploading(true);
        const proofPhotoPublicId = await uploadRiderImage('delivery-proof', photo);
        setUploading(false);
        await complete.mutateAsync({ jobId, proofPhotoPublicId });
      }
      toast.success(t('jobCompleted'));
    } catch (e) {
      setUploading(false);
      onError(e);
    }
  };

  const canComplete = !job.proof.required || (activeProof === 'OTP' ? /^\d{4}$/.test(otp) : !!photo);
  const offered = job.status === 'UNASSIGNED' || job.status === 'ASSIGNED';
  const finished = job.status === 'COMPLETED';
  const next = job.status === 'IN_TRANSIT' ? 'to' : 'from';

  if (finished && complete.isSuccess) return <SuccessPanel job={job} />;

  const submitFail = () =>
    fail.mutate(
      { jobId, reason: failReason.trim() },
      {
        onSuccess: () => setShowFail(false),
        onError,
      },
    );

  return (
    <div className="@container">
      <div className="space-y-5 @3xl:grid @3xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] @3xl:items-start @3xl:gap-6 @3xl:space-y-0">
        <div className="min-w-0 space-y-5">
          <section className="bg-card space-y-4 rounded-2xl border p-4 shadow-xs">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1.5">
                <JobTypeChip type={job.jobType} />
                <p className="tabular text-muted-foreground text-xs font-medium" dir="ltr">
                  {job.order.orderNo}
                </p>
              </div>
              <div className="text-end">
                <p className="tabular text-2xl leading-none font-semibold tracking-tight">
                  {formatMoney(job.riderFee)}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">{t('yourFee')}</p>
              </div>
            </div>
            <JobMeta job={job} />
            {offered ? (
              <Badge variant="warning">{t(`jobStatus.${job.status}`)}</Badge>
            ) : job.status === 'FAILED' || job.status === 'CANCELLED' ? (
              <Badge variant="destructive">{t(`jobStatus.${job.status}`)}</Badge>
            ) : (
              <StepTracker job={job} />
            )}
            {job.failureReason ? (
              <Alert variant="destructive">
                <AlertDescription>{job.failureReason}</AlertDescription>
              </Alert>
            ) : null}
          </section>

          <div className="stagger space-y-4">
            <StopCard
              title={t('pickupAddress')}
              party={job.from}
              highlight={next === 'from' && job.status !== 'COMPLETED'}
            />
            <StopCard title={t('dropAddress')} party={job.to} highlight={next === 'to'} />
          </div>
        </div>

        <div className={cn('min-w-0 space-y-5 @3xl:sticky', embedded ? '@3xl:top-2' : '@3xl:top-24')}>
          {job.status === 'IN_TRANSIT' && job.proof.required ? (
            <section className="animate-pop bg-card space-y-4 rounded-2xl border p-4 shadow-xs">
              <h3 className="font-semibold">{t('proofType')}</h3>
              {types.length > 1 ? (
                <div role="tablist" className="bg-muted grid grid-cols-2 gap-1 rounded-xl p-1">
                  {types.map((type) => (
                    <button
                      key={type}
                      role="tab"
                      aria-selected={activeProof === type}
                      onClick={() => setProofType(type)}
                      className={cn(
                        'flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all',
                        activeProof === type ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground',
                      )}
                    >
                      {type === 'PHOTO' ? (
                        <Camera className="size-4" aria-hidden />
                      ) : (
                        <KeyRound className="size-4" aria-hidden />
                      )}
                      {type === 'PHOTO' ? t('photo') : t('otp')}
                    </button>
                  ))}
                </div>
              ) : null}
              {activeProof === 'OTP' ? (
                <div className="space-y-3">
                  <p className="text-muted-foreground text-center text-sm">{t('enterOtp')}</p>
                  <CodeBoxes value={otp} onChange={setOtp} />
                </div>
              ) : (
                <label className="border-input hover:bg-accent/50 flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-center transition-colors">
                  <Camera className="text-muted-foreground size-7" aria-hidden />
                  <span className="text-sm font-medium">{photo ? photo.name : t('takePhoto')}</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                  />
                </label>
              )}
            </section>
          ) : null}

          {finished ? (
            <p className="text-success-text animate-pop flex items-center justify-center gap-2 py-2 text-lg font-semibold">
              <Check className="size-5" aria-hidden /> {t('jobCompleted')}
            </p>
          ) : null}

          {offered || job.status === 'ACCEPTED' || job.status === 'IN_TRANSIT' ? (
            <div
              className="bg-background/95 supports-[backdrop-filter]:bg-background/85 fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-md lg:bg-card lg:sticky lg:inset-x-auto lg:bottom-3 lg:z-10 lg:rounded-2xl lg:border lg:shadow-xs lg:backdrop-blur-none"
              style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
              <div className="mx-auto w-full max-w-3xl space-y-2 p-4 lg:max-w-none">
                {offered ? (
                  <div className={cn('grid gap-2', job.status === 'ASSIGNED' ? 'grid-cols-[1fr_auto]' : 'grid-cols-1')}>
                    <Button
                      size="lg"
                      className="h-14 text-base"
                      disabled={busy}
                      onClick={() =>
                        action.mutate({ jobId, action: job.status === 'ASSIGNED' ? 'accept' : 'claim' }, { onError })
                      }
                    >
                      {busy ? t('updating') : home('acceptJob')}
                    </Button>
                    {job.status === 'ASSIGNED' ? (
                      <Button
                        size="lg"
                        variant="outline"
                        className="h-14"
                        disabled={busy}
                        onClick={() => action.mutate({ jobId, action: 'decline' }, { onError })}
                      >
                        {home('decline')}
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                {job.status === 'ACCEPTED' ? (
                  <Button
                    size="lg"
                    className="h-14 w-full text-base"
                    disabled={busy}
                    onClick={() => action.mutate({ jobId, action: 'start' }, { onError })}
                  >
                    {action.isPending ? t('updating') : t('markInTransit')}
                  </Button>
                ) : null}

                {job.status === 'IN_TRANSIT' ? (
                  <>
                    <Button
                      size="lg"
                      className="h-14 w-full text-base"
                      disabled={busy || !canComplete}
                      onClick={() => void handleComplete()}
                    >
                      {busy ? t('submitting') : t('markCompleted')}
                    </Button>
                    <Button
                      variant="ghost"
                      className="text-muted-foreground h-11 w-full"
                      onClick={() => setShowFail(true)}
                    >
                      {t('reportProblem')}
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <Sheet open={showFail} onOpenChange={setShowFail}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl p-5"
          style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
        >
          <SheetHeader className="p-0">
            <SheetTitle>{t('failTitle')}</SheetTitle>
            <SheetDescription>{t('failReason')}</SheetDescription>
          </SheetHeader>
          <div className="flex flex-wrap gap-2">
            {FAIL_REASONS.map((key) => {
              const text = t(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFailReason(text)}
                  className={cn(
                    'min-h-11 rounded-full border px-4 text-sm font-medium transition-colors',
                    failReason === text ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent',
                  )}
                >
                  {text}
                </button>
              );
            })}
          </div>
          <Input
            value={failReason}
            onChange={(e) => setFailReason(e.target.value)}
            placeholder={t('failPlaceholder')}
            className="h-12"
          />
          <Button
            variant="destructive"
            size="lg"
            className="h-14 w-full text-base"
            disabled={busy || failReason.trim().length < 3}
            onClick={submitFail}
          >
            {fail.isPending ? t('submitting') : t('markFailed')}
          </Button>
        </SheetContent>
      </Sheet>
    </div>
  );
}
