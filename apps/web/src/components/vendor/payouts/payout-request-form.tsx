'use client';

import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { compareMoney } from '@dhoblio/shared';
import { BffError } from '@/lib/api/bff';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRequestPayout } from '@/lib/vendor/hooks/use-vendor-payouts';

const schema = z.object({
  amount: z
    .string()
    .trim()
    .regex(/^\d{1,9}(\.\d{1,2})?$/, 'invalidAmount'),
  accountRef: z.string().trim().min(5, 'invalidAccount').max(64, 'invalidAccount'),
  note: z.string().trim().max(300).optional(),
});
type Form = z.infer<typeof schema>;

export function PayoutRequestForm({ available }: { available: string }) {
  const t = useTranslations('vendor.payouts');
  const mutation = useRequestPayout();
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { amount: '', accountRef: '', note: '' },
  });
  const errors = form.formState.errors;

  const onSubmit = async (values: Form) => {
    if (compareMoney(values.amount, available) > 0) {
      form.setError('amount', { message: 'insufficientBalance' });
      return;
    }
    try {
      await mutation.mutateAsync({
        amount: values.amount,
        method: 'BANK',
        accountRef: values.accountRef,
        note: values.note || undefined,
      });
      toast.success(t('requested'));
      form.reset();
    } catch (e) {
      toast.error(e instanceof BffError ? e.message : t('requestFailed'));
    }
  };

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold">{t('requestTitle')}</h2>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3" noValidate>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="payout-amount">{t('amount')}</Label>
            <button
              type="button"
              className="text-primary text-xs font-medium hover:underline"
              onClick={() => form.setValue('amount', available, { shouldValidate: true })}
            >
              {t('useFull')}
            </button>
          </div>
          <Input
            id="payout-amount"
            inputMode="decimal"
            dir="ltr"
            placeholder="2500.00"
            className="tabular text-base"
            {...form.register('amount')}
          />
          {errors.amount ? <p className="text-destructive text-xs">{t(errors.amount.message as string)}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="payout-iban">{t('iban')}</Label>
          <Input id="payout-iban" dir="ltr" placeholder="PK36SCBL0000001123456702" {...form.register('accountRef')} />
          {errors.accountRef ? (
            <p className="text-destructive text-xs">{t(errors.accountRef.message as string)}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="payout-note">{t('note')}</Label>
          <Input id="payout-note" {...form.register('note')} />
        </div>
        <Button type="submit" disabled={mutation.isPending} className="w-full sm:w-auto">
          {mutation.isPending ? t('submitting') : t('submit')}
        </Button>
      </form>
    </Card>
  );
}
