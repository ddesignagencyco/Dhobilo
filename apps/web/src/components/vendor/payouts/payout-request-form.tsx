'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const payoutSchema = z.object({
  iban: z.string().regex(/^PK\d{2}\w{4}\d{21}$/, 'Invalid IBAN'),
  amount: z.string().transform(Number).pipe(z.number().positive()),
});

type PayoutForm = z.infer<typeof payoutSchema>;

export function PayoutRequestForm({ availableBalance }: { availableBalance: number }) {
  const t = useTranslations('vendor.payouts');
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<PayoutForm>({
    resolver: zodResolver(payoutSchema),
  });

  const onSubmit = async (data: PayoutForm) => {
    if (data.amount > availableBalance) {
      form.setError('amount', { message: t('insufficientBalance') });
      return;
    }
    toast.success(t('payoutRequested'));
    setSubmitted(true);
    form.reset();
  };

  if (submitted) {
    return (
      <Card className="p-6 text-center space-y-4">
        <div className="text-4xl">✓</div>
        <h3 className="font-semibold text-lg">{t('requestSubmitted')}</h3>
        <p className="text-muted-foreground text-sm">{t('reviewNotice')}</p>
        <Button onClick={() => setSubmitted(false)} className="w-full">
          {t('newRequest')}
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="text-sm font-medium">{t('bankIban')}</label>
          <Input
            {...form.register('iban')}
            placeholder="PK94 ABCD 0123 4567 8900 1234 567"
            className="mt-1"
          />
          {form.formState.errors.iban && (
            <p className="text-sm text-red-600 mt-1">{form.formState.errors.iban.message}</p>
          )}
        </div>

        <div>
          <label className="text-sm font-medium">{t('amount')}</label>
          <div className="relative mt-1">
            <span className="absolute left-3 top-2.5 text-muted-foreground">Rs.</span>
            <Input
              {...form.register('amount')}
              type="number"
              placeholder="0.00"
              className="pl-10"
              step="0.01"
            />
          </div>
          {form.formState.errors.amount && (
            <p className="text-sm text-red-600 mt-1">{form.formState.errors.amount.message}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {t('available')}: Rs. {availableBalance.toFixed(2)}
          </p>
        </div>

        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? t('submitting') : t('requestPayout')}
        </Button>
      </form>
    </Card>
  );
}
