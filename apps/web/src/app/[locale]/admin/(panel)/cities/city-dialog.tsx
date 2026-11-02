'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { type UpdateCityForm, type UpdateCityInput, updateCitySchema } from '@dhoblio/shared';
import { Field, applyServerFieldErrors } from '@/components/admin/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BffError } from '@/lib/api/bff';
import type { AdminCity, CourierPartner } from '@/lib/api/types';
import { useAdminMutation } from '@/lib/hooks/use-admin-mutation';

const FIELDS = ['deliveryFee', 'isActive', 'code', 'nameUr', 'courierPartnerId'] as const;

/** Sentinel for "our own riders": the API wants an explicit null, which a Select cannot hold. */
const OWN_RIDERS = '__own__';

export function CityDialog({
  city,
  partners,
  onClose,
}: {
  city: AdminCity;
  partners: CourierPartner[];
  onClose: () => void;
}) {
  const t = useTranslations();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<UpdateCityForm, unknown, UpdateCityInput>({
    resolver: zodResolver(updateCitySchema),
    defaultValues: {
      deliveryFee: Number(city.deliveryFee),
      code: city.code ?? undefined,
      nameUr: city.nameUr ?? '',
      courierPartnerId: city.courierPartnerId,
    },
  });

  const save = useAdminMutation<unknown, UpdateCityInput>({
    request: (input) => ({
      path: `/admin/cities/${city.id}`,
      options: {
        method: 'PATCH',
        body: {
          deliveryFee: input.deliveryFee,
          ...(input.code ? { code: input.code } : {}),
          ...(input.nameUr ? { nameUr: input.nameUr } : {}),
          // null is meaningful here — it hands the city back to our own riders — so it is sent, not omitted.
          courierPartnerId: input.courierPartnerId ?? null,
        },
      },
    }),
    successMessage: t('cities.saved'),
    invalidate: [['admin', 'cities'], ['cities']],
    onSuccess: onClose,
  });

  async function onSubmit(values: UpdateCityInput) {
    setFormError(null);
    try {
      await save.mutateAsync(values);
    } catch (error) {
      if (error instanceof BffError && error.fieldErrors.length) {
        const unmatched = applyServerFieldErrors(error.fieldErrors, FIELDS, form.setError);
        if (unmatched.length) setFormError(unmatched.join(' · '));
      }
    }
  }

  const selectedPartner = form.watch('courierPartnerId');

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('cities.editTitle', { name: city.name })}</DialogTitle>
          <DialogDescription>{t('cities.editBody')}</DialogDescription>
        </DialogHeader>

        {formError ? (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field
            name="deliveryFee"
            label={t('cities.deliveryFee')}
            error={form.formState.errors.deliveryFee}
            hint={t('cities.deliveryFeeHint')}
          >
            <Input
              id="deliveryFee"
              type="number"
              step="0.01"
              min="0"
              max="5000"
              inputMode="decimal"
              dir="ltr"
              {...form.register('deliveryFee')}
            />
          </Field>

          <Field
            name="code"
            label={t('cities.code')}
            error={form.formState.errors.code}
            hint={t('cities.codeHint')}
          >
            <Input id="code" dir="ltr" className="font-mono uppercase" maxLength={4} {...form.register('code')} />
          </Field>

          <Field name="nameUr" label={t('cities.nameUr')} error={form.formState.errors.nameUr}>
            <Input id="nameUr" dir="rtl" lang="ur" {...form.register('nameUr')} />
          </Field>

          <Field
            name="courierPartnerId"
            label={t('cities.delivery')}
            error={form.formState.errors.courierPartnerId}
            hint={t('cities.courierHint')}
          >
            <Select
              value={selectedPartner ?? OWN_RIDERS}
              onValueChange={(v) => form.setValue('courierPartnerId', v === OWN_RIDERS ? null : v)}
            >
              <SelectTrigger id="courierPartnerId" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={OWN_RIDERS}>{t('cities.ownRiders')}</SelectItem>
                {partners.map((partner) => (
                  <SelectItem key={partner.id} value={partner.id}>
                    {partner.name}
                    {!partner.isActive ? ` (${t('cities.partnerInactive')})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Loader2 className="animate-spin" /> : null}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
