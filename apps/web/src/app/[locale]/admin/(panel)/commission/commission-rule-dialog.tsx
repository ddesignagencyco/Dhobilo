'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import {
  CommissionScope,
  type CreateCommissionRuleForm,
  type CreateCommissionRuleInput,
  createCommissionRuleSchema,
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
import { BffError, bffData } from '@/lib/api/bff';
import type { AdminVendorListItem, ServiceCategory } from '@/lib/api/types';
import { businessToday } from '@/lib/format';
import { useAdminMutation } from '@/lib/hooks/use-admin-mutation';

const FIELDS = ['scope', 'vendorId', 'categoryId', 'ratePct', 'effectiveFrom'] as const;

export function CommissionRuleDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations();
  const [formError, setFormError] = useState<string | null>(null);

  // <form input, context, parsed output>: ratePct and categoryId are coerced, so the two differ.
  const form = useForm<CreateCommissionRuleForm, unknown, CreateCommissionRuleInput>({
    resolver: zodResolver(createCommissionRuleSchema),
    defaultValues: {
      scope: CommissionScope.GLOBAL,
      ratePct: 15,
      effectiveFrom: businessToday(),
    },
  });

  const scope = form.watch('scope');

  // Only fetched when the chosen scope actually needs them.
  const vendors = useQuery({
    queryKey: ['admin', 'vendors', 'for-commission'],
    queryFn: () =>
      bffData<AdminVendorListItem[]>('/admin/vendors', { query: { status: 'APPROVED', limit: 50 } }),
    enabled: scope === CommissionScope.VENDOR,
  });

  const categories = useQuery({
    queryKey: ['service-categories'],
    queryFn: () => bffData<ServiceCategory[]>('/service-categories'),
    enabled: scope === CommissionScope.CATEGORY,
    staleTime: 60 * 60_000,
  });

  const create = useAdminMutation<unknown, CreateCommissionRuleInput>({
    request: (input) => ({
      path: '/admin/commission-rules',
      options: {
        body: {
          scope: input.scope,
          ratePct: input.ratePct,
          ...(input.scope === CommissionScope.VENDOR ? { vendorId: input.vendorId } : {}),
          ...(input.scope === CommissionScope.CATEGORY ? { categoryId: input.categoryId } : {}),
          // The API wants ISO-8601; a date input gives YYYY-MM-DD, which it accepts as midnight UTC.
          ...(input.effectiveFrom ? { effectiveFrom: input.effectiveFrom } : {}),
        },
      },
    }),
    successMessage: t('commission.addDone'),
    invalidate: [['admin', 'commission-rules']],
    onSuccess: onClose,
  });

  async function onSubmit(values: CreateCommissionRuleInput) {
    setFormError(null);
    try {
      await create.mutateAsync(values);
    } catch (error) {
      if (error instanceof BffError && error.fieldErrors.length) {
        const unmatched = applyServerFieldErrors(error.fieldErrors, FIELDS, form.setError);
        if (unmatched.length) setFormError(unmatched.join(' · '));
      }
      // Anything else already surfaced as a toast from useAdminMutation.
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('commission.addTitle')}</DialogTitle>
          <DialogDescription>{t('commission.addBody')}</DialogDescription>
        </DialogHeader>

        {formError ? (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field name="scope" label={t('commission.scope')} error={form.formState.errors.scope} required>
            <Select
              value={scope}
              onValueChange={(value) => {
                form.setValue('scope', value as CreateCommissionRuleForm['scope']);
                // Clear the other scope's target so a stale vendorId cannot ride along on a category rule.
                form.setValue('vendorId', undefined);
                form.setValue('categoryId', undefined);
                form.clearErrors(['vendorId', 'categoryId']);
              }}
            >
              <SelectTrigger id="scope" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CommissionScope.GLOBAL}>{t('commission.scopeGlobal')}</SelectItem>
                <SelectItem value={CommissionScope.CATEGORY}>{t('commission.scopeCategory')}</SelectItem>
                <SelectItem value={CommissionScope.VENDOR}>{t('commission.scopeVendor')}</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {scope === CommissionScope.VENDOR ? (
            <Field
              name="vendorId"
              label={t('common.vendor')}
              error={form.formState.errors.vendorId}
              hint={vendors.data && vendors.data.length >= 50 ? t('commission.vendorListCapped') : undefined}
              required
            >
              <Select value={form.watch('vendorId') ?? ''} onValueChange={(v) => form.setValue('vendorId', v)}>
                <SelectTrigger id="vendorId" className="w-full">
                  <SelectValue placeholder={vendors.isLoading ? t('common.loading') : t('commission.chooseVendor')} />
                </SelectTrigger>
                <SelectContent>
                  {(vendors.data ?? []).map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.id}>
                      {vendor.businessName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          {scope === CommissionScope.CATEGORY ? (
            <Field name="categoryId" label={t('commission.category')} error={form.formState.errors.categoryId} required>
              <Select
                value={form.watch('categoryId') ? String(form.watch('categoryId')) : ''}
                onValueChange={(v) => form.setValue('categoryId', Number(v))}
              >
                <SelectTrigger id="categoryId" className="w-full">
                  <SelectValue placeholder={categories.isLoading ? t('common.loading') : t('commission.chooseCategory')} />
                </SelectTrigger>
                <SelectContent>
                  {(categories.data ?? []).map((category) => (
                    <SelectItem key={category.id} value={String(category.id)}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          <Field
            name="ratePct"
            label={t('commission.rate')}
            error={form.formState.errors.ratePct}
            hint={t('commission.rateHint')}
            required
          >
            <Input
              id="ratePct"
              type="number"
              step="0.01"
              min="0"
              max="100"
              inputMode="decimal"
              dir="ltr"
              {...form.register('ratePct')}
            />
          </Field>

          <Field
            name="effectiveFrom"
            label={t('commission.effectiveFrom')}
            error={form.formState.errors.effectiveFrom}
            hint={t('commission.effectiveFromHint')}
          >
            <Input id="effectiveFrom" type="date" dir="ltr" {...form.register('effectiveFrom')} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={create.isPending}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? <Loader2 className="animate-spin" /> : null}
              {t('commission.add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
