'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Field } from '@/components/admin/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { type VendorProfile, useUpdateVendorProfile } from '@/lib/vendor/hooks/use-vendor-hours';

export function ServiceSettings({ profile }: { profile: VendorProfile }) {
  const t = useTranslations('vendor.hours.settings');
  const update = useUpdateVendorProfile();
  const [radius, setRadius] = useState(String(profile.serviceRadiusKm));
  const [respond, setRespond] = useState(String(profile.respondWithinMin));
  const [slots, setSlots] = useState(String(profile.slotCapacity));

  const radiusNum = Number(radius);
  const respondNum = Number(respond);
  const slotsNum = Number(slots);
  const errors = {
    radius: !(radiusNum >= 0.5 && radiusNum <= 50) ? t('radiusInvalid') : undefined,
    respond: !(Number.isInteger(respondNum) && respondNum >= 5 && respondNum <= 60) ? t('respondInvalid') : undefined,
    slots: !(Number.isInteger(slotsNum) && slotsNum >= 1) ? t('slotsInvalid') : undefined,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  return (
    <form
      className="grid gap-4 @3xl:grid-cols-3 @7xl:grid-cols-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (hasErrors) return;
        update.mutate(
          {
            serviceRadiusKm: radiusNum,
            respondWithinMin: respondNum,
            slotCapacity: slotsNum,
          },
          {
            onSuccess: () => toast.success(t('saved')),
            onError: (error) => toast.error(error.message),
          },
        );
      }}
    >
      <Field
        name="radius"
        label={t('radius')}
        hint={t('radiusHint')}
        error={errors.radius ? { message: errors.radius } : undefined}
      >
        <Input
          id="radius"
          type="number"
          inputMode="decimal"
          step="0.5"
          dir="ltr"
          value={radius}
          onChange={(e) => setRadius(e.target.value)}
        />
      </Field>
      <Field
        name="respond"
        label={t('respond')}
        hint={t('respondHint')}
        error={errors.respond ? { message: errors.respond } : undefined}
      >
        <Input
          id="respond"
          type="number"
          inputMode="numeric"
          dir="ltr"
          value={respond}
          onChange={(e) => setRespond(e.target.value)}
        />
      </Field>
      <Field
        name="slots"
        label={t('slots')}
        hint={t('slotsHint')}
        error={errors.slots ? { message: errors.slots } : undefined}
      >
        <Input
          id="slots"
          type="number"
          inputMode="numeric"
          dir="ltr"
          value={slots}
          onChange={(e) => setSlots(e.target.value)}
        />
      </Field>
      <div className="@3xl:col-span-3 @7xl:col-span-1">
        <Button type="submit" disabled={hasErrors || update.isPending}>
          {update.isPending ? <Loader2 className="animate-spin" /> : null}
          {t('save')}
        </Button>
      </div>
    </form>
  );
}
