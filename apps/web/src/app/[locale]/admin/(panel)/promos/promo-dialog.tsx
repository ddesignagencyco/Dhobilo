'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import {
  type CreatePromoForm,
  type CreatePromoInput,
  DiscountType,
  createPromoSchema,
} from '@dhoblio/shared';
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
import type { AdminPromo } from '@/lib/api/types';
import { formatIsoDate } from '@/lib/format';
import { useAdminMutation } from '@/lib/hooks/use-admin-mutation';
import { useCities } from '@/lib/hooks/use-cities';

const FIELDS = [
  'code',
  'discountType',
  'value',
  'maxDiscount',
  'minOrderAmount',
  'maxUses',
  'perUserLimit',
  'validFrom',
  'validTo',
  'cityId',
  'isActive',
] as const;

/** Blank strings are how an empty optional input arrives; the API wants them absent, not "". */
function omitEmpty<T extends Record<string, unknown>>(input: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === '' || value === undefined || value === null || Number.isNaN(value)) continue;
    out[key] = value;
  }
  return out as Partial<T>;
}

/**
 * Create or edit a promo.
 *
 * `code` and `discountType` are immutable once created — the API's UpdatePromoDto has neither, because a
 * code that has already been handed to customers must keep meaning the same thing. So on edit those two
 * are shown read-only rather than quietly ignored.
 */
export function PromoDialog({ promo, onClose }: { promo?: AdminPromo; onClose: () => void }) {
  const t = useTranslations();
  const { data: cities } = useCities();
  const [formError, setFormError] = useState<string | null>(null);
  const editing = !!promo;

  const form = useForm<CreatePromoForm, unknown, CreatePromoInput>({
    resolver: zodResolver(createPromoSchema),
    defaultValues: promo
      ? {
          code: promo.code,
          discountType: promo.discountType,
          value: promo.value,
          maxDiscount: promo.maxDiscount ?? '',
          minOrderAmount: promo.minOrderAmount ?? '',
          maxUses: promo.maxUses ?? undefined,
          perUserLimit: promo.perUserLimit,
          validFrom: formatIsoDate(promo.validFrom),
          validTo: formatIsoDate(promo.validTo),
          cityId: promo.cityId ?? undefined,
          isActive: promo.isActive,
        }
      : {
          discountType: DiscountType.PERCENT,
          perUserLimit: 1,
          isActive: true,
        },
  });

  const discountType = form.watch('discountType');

  const save = useAdminMutation<unknown, CreatePromoInput>({
    request: (input) => {
      const body = omitEmpty({
        value: input.value,
        maxDiscount: input.maxDiscount,
        minOrderAmount: input.minOrderAmount,
        maxUses: input.maxUses,
        perUserLimit: input.perUserLimit,
        validFrom: input.validFrom,
        validTo: input.validTo,
        cityId: input.cityId,
        isActive: input.isActive,
      });
      return editing
        ? { path: `/admin/promos/${promo.id}`, options: { method: 'PATCH', body } }
        : {
            path: '/admin/promos',
            // code and discountType are only accepted on create.
            options: { body: { ...body, code: input.code, discountType: input.discountType } },
          };
    },
    successMessage: editing ? t('promos.updateDone') : t('promos.addDone'),
    invalidate: [['admin', 'promos']],
    onSuccess: onClose,
  });

  async function onSubmit(values: CreatePromoInput) {
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

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? t('promos.editTitle', { code: promo.code }) : t('promos.addTitle')}</DialogTitle>
          <DialogDescription>{editing ? t('promos.editBody') : t('promos.addBody')}</DialogDescription>
        </DialogHeader>

        {formError ? (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              name="code"
              label={t('promos.code')}
              error={form.formState.errors.code}
              hint={editing ? t('promos.codeLocked') : t('promos.codeHint')}
              required
            >
              <Input
                id="code"
                dir="ltr"
                className="font-mono uppercase"
                readOnly={editing}
                disabled={editing}
                {...form.register('code')}
              />
            </Field>

            <Field
              name="discountType"
              label={t('promos.discountType')}
              error={form.formState.errors.discountType}
              hint={editing ? t('promos.typeLocked') : undefined}
              required
            >
              <Select
                value={discountType}
                onValueChange={(v) => form.setValue('discountType', v as CreatePromoForm['discountType'])}
                disabled={editing}
              >
                <SelectTrigger id="discountType" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DiscountType.PERCENT}>{t('promos.percent')}</SelectItem>
                  <SelectItem value={DiscountType.FLAT}>{t('promos.flat')}</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field
              name="value"
              label={discountType === DiscountType.PERCENT ? t('promos.percentValue') : t('promos.flatValue')}
              error={form.formState.errors.value}
              required
            >
              <Input id="value" dir="ltr" inputMode="decimal" placeholder="15" {...form.register('value')} />
            </Field>

            {discountType === DiscountType.PERCENT ? (
              <Field
                name="maxDiscount"
                label={t('promos.maxDiscount')}
                error={form.formState.errors.maxDiscount}
                hint={t('promos.maxDiscountHint')}
              >
                <Input id="maxDiscount" dir="ltr" inputMode="decimal" placeholder="200" {...form.register('maxDiscount')} />
              </Field>
            ) : null}

            <Field
              name="minOrderAmount"
              label={t('promos.minOrderAmount')}
              error={form.formState.errors.minOrderAmount}
            >
              <Input id="minOrderAmount" dir="ltr" inputMode="decimal" placeholder="500" {...form.register('minOrderAmount')} />
            </Field>

            <Field
              name="maxUses"
              label={t('promos.maxUses')}
              error={form.formState.errors.maxUses}
              hint={t('promos.maxUsesHint')}
            >
              <Input id="maxUses" type="number" min="1" dir="ltr" {...form.register('maxUses')} />
            </Field>

            <Field name="perUserLimit" label={t('promos.perUserLimit')} error={form.formState.errors.perUserLimit}>
              <Input id="perUserLimit" type="number" min="1" max="100" dir="ltr" {...form.register('perUserLimit')} />
            </Field>

            <Field name="validFrom" label={t('promos.validFrom')} error={form.formState.errors.validFrom} required>
              <Input id="validFrom" type="date" dir="ltr" {...form.register('validFrom')} />
            </Field>

            <Field name="validTo" label={t('promos.validTo')} error={form.formState.errors.validTo} required>
              <Input id="validTo" type="date" dir="ltr" {...form.register('validTo')} />
            </Field>

            <Field name="cityId" label={t('common.city')} error={form.formState.errors.cityId} hint={t('promos.cityHint')}>
              <Select
                value={form.watch('cityId') ? String(form.watch('cityId')) : 'all'}
                onValueChange={(v) => form.setValue('cityId', v === 'all' ? undefined : Number(v))}
              >
                <SelectTrigger id="cityId" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.allCities')}</SelectItem>
                  {(cities ?? []).map((city) => (
                    <SelectItem key={city.id} value={String(city.id)}>
                      {city.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Loader2 className="animate-spin" /> : null}
              {editing ? t('common.save') : t('promos.add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
