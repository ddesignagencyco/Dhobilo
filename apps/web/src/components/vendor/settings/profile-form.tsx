'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { type VendorProfile, useUpdateVendorProfile, useVendorProfile } from '@/lib/vendor/hooks/use-vendor-profile';

interface FormState {
  businessName: string;
  description: string;
  serviceRadiusKm: string;
  respondWithinMin: string;
  slotCapacity: string;
}

export function ProfileForm({ isOwner }: { isOwner: boolean }) {
  const t = useTranslations('vendor.settings');
  const profile = useVendorProfile();

  if (profile.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10" />
        <Skeleton className="h-24" />
        <Skeleton className="h-10" />
      </div>
    );
  }
  if (profile.isError || !profile.data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('loadFailed')}</AlertDescription>
      </Alert>
    );
  }
  return <ProfileFormFields profile={profile.data} isOwner={isOwner} />;
}

function ProfileFormFields({ profile, isOwner }: { profile: VendorProfile; isOwner: boolean }) {
  const t = useTranslations('vendor.settings');
  const update = useUpdateVendorProfile();
  const [form, setForm] = useState<FormState>({
    businessName: profile.businessName,
    description: profile.description ?? '',
    serviceRadiusKm: String(Number(profile.serviceRadiusKm)),
    respondWithinMin: String(profile.respondWithinMin),
    slotCapacity: String(profile.slotCapacity),
  });
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [key]: e.target.value });

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const radius = Number(form.serviceRadiusKm);
    const respond = Number(form.respondWithinMin);
    const slots = Number(form.slotCapacity);
    if (form.businessName.trim().length < 2) return setError(t('errors.name'));
    if (!(radius >= 0.5 && radius <= 50)) return setError(t('errors.radius'));
    if (!Number.isInteger(respond) || respond < 5 || respond > 60) return setError(t('errors.respond'));
    if (!Number.isInteger(slots) || slots < 1 || slots > 100) return setError(t('errors.slots'));
    try {
      await update.mutateAsync({
        businessName: form.businessName.trim(),
        description: form.description.trim(),
        serviceRadiusKm: radius,
        respondWithinMin: respond,
        slotCapacity: slots,
      });
      toast.success(t('saved'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('saveFailed'));
    }
  }

  return (
    <form onSubmit={onSubmit} className="bg-card space-y-5 rounded-xl border p-4 sm:p-6" noValidate>
      {!isOwner ? (
        <Alert variant="info">
          <AlertDescription>{t('ownerOnlyEdit')}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="businessName">{t('businessName')}</Label>
        <Input id="businessName" value={form.businessName} onChange={set('businessName')} disabled={!isOwner} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">{t('description')}</Label>
        <Textarea
          id="description"
          value={form.description}
          onChange={set('description')}
          maxLength={500}
          rows={3}
          disabled={!isOwner}
        />
      </div>
      <div className="space-y-2">
        <Label>{t('address')}</Label>
        <p className="text-muted-foreground text-sm">{profile.addressLine}</p>
        <p className="text-muted-foreground text-xs">{t('addressHint')}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="serviceRadiusKm">{t('radius')}</Label>
          <Input
            id="serviceRadiusKm"
            type="number"
            inputMode="decimal"
            step="0.5"
            dir="ltr"
            value={form.serviceRadiusKm}
            onChange={set('serviceRadiusKm')}
            disabled={!isOwner}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="respondWithinMin">{t('respond')}</Label>
          <Input
            id="respondWithinMin"
            type="number"
            inputMode="numeric"
            dir="ltr"
            value={form.respondWithinMin}
            onChange={set('respondWithinMin')}
            disabled={!isOwner}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="slotCapacity">{t('slots')}</Label>
          <Input
            id="slotCapacity"
            type="number"
            inputMode="numeric"
            dir="ltr"
            value={form.slotCapacity}
            onChange={set('slotCapacity')}
            disabled={!isOwner}
          />
        </div>
      </div>
      {isOwner ? (
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? t('saving') : t('save')}
        </Button>
      ) : null}
    </form>
  );
}
