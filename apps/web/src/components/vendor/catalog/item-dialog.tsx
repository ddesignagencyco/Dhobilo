'use client';

import { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
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
import { BffError } from '@/lib/api/bff';
import {
  SERVICE_TYPES,
  type ServiceCategory,
  type VendorCatalogItem,
  useCreateCatalogItem,
  useUpdateCatalogItem,
} from '@/lib/vendor/hooks/use-vendor-catalog';

const FIELDS = ['categoryId', 'itemName', 'itemNameUr', 'serviceType', 'price', 'turnaroundHours'] as const;
const SELECT_CLASS = 'bg-background h-9 w-full rounded-md border px-3 text-sm';

export function ItemDialog({
  item,
  categories,
  locale,
  onClose,
}: {
  item: VendorCatalogItem | null;
  categories: ServiceCategory[];
  locale: string;
  onClose: () => void;
}) {
  const t = useTranslations('vendor.catalog');
  const [formError, setFormError] = useState<string | null>(null);
  const create = useCreateCatalogItem();
  const update = useUpdateCatalogItem();

  const schema = useMemo(
    () =>
      z.object({
        categoryId: z.string().min(1, t('errors.categoryRequired')),
        itemName: z.string().trim().min(1, t('errors.nameRequired')).max(80),
        itemNameUr: z.string().trim().max(80),
        serviceType: z.enum(SERVICE_TYPES),
        price: z
          .string()
          .refine(
            (v) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) >= 1 && Number(v) <= 500000,
            t('errors.priceInvalid'),
          ),
        turnaroundHours: z
          .string()
          .refine((v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 720, t('errors.turnaroundInvalid')),
      }),
    [t],
  );
  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      categoryId: item ? String(item.categoryId) : '',
      itemName: item?.itemName ?? '',
      itemNameUr: item?.itemNameUr ?? '',
      serviceType: item?.serviceType ?? 'WASH_IRON',
      price: item ? String(Number(item.price)) : '',
      turnaroundHours: item ? String(item.turnaroundHours) : '48',
    },
  });

  const pending = create.isPending || update.isPending;

  async function onSubmit(values: FormValues) {
    setFormError(null);
    const body = {
      categoryId: Number(values.categoryId),
      itemName: values.itemName,
      ...(values.itemNameUr ? { itemNameUr: values.itemNameUr } : {}),
      serviceType: values.serviceType,
      price: Number(values.price),
      turnaroundHours: Number(values.turnaroundHours),
    };
    try {
      if (item) await update.mutateAsync({ id: item.id, ...body });
      else await create.mutateAsync(body);
      onClose();
    } catch (error) {
      if (error instanceof BffError && error.fieldErrors.length) {
        const unmatched = applyServerFieldErrors(error.fieldErrors, FIELDS, form.setError);
        if (unmatched.length) setFormError(unmatched.join(' · '));
      } else {
        setFormError(error instanceof Error ? error.message : t('errors.generic'));
      }
    }
  }

  const errors = form.formState.errors;

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? t('form.editTitle') : t('form.addTitle')}</DialogTitle>
          <DialogDescription>{t('form.description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="itemName" label={t('form.itemName')} error={errors.itemName} required>
              <Input id="itemName" {...form.register('itemName')} aria-invalid={!!errors.itemName} />
            </Field>
            <Field name="itemNameUr" label={t('form.itemNameUr')} error={errors.itemNameUr}>
              <Input id="itemNameUr" dir="rtl" {...form.register('itemNameUr')} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="categoryId" label={t('form.category')} error={errors.categoryId} required>
              <select id="categoryId" className={SELECT_CLASS} {...form.register('categoryId')}>
                <option value="">{t('form.choose')}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {locale === 'ur' && c.nameUr ? c.nameUr : c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field name="serviceType" label={t('form.serviceType')} error={errors.serviceType} required>
              <select id="serviceType" className={SELECT_CLASS} {...form.register('serviceType')}>
                {SERVICE_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {t(`serviceType.${s}`)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="price" label={t('form.price')} error={errors.price} required>
              <Input
                id="price"
                type="text"
                inputMode="decimal"
                dir="ltr"
                {...form.register('price')}
                aria-invalid={!!errors.price}
              />
            </Field>
            <Field name="turnaroundHours" label={t('form.turnaroundHours')} error={errors.turnaroundHours} required>
              <Input
                id="turnaroundHours"
                type="text"
                inputMode="numeric"
                dir="ltr"
                {...form.register('turnaroundHours')}
                aria-invalid={!!errors.turnaroundHours}
              />
            </Field>
          </div>

          {formError ? (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              {t('form.cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {pending ? t('form.saving') : t('form.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
