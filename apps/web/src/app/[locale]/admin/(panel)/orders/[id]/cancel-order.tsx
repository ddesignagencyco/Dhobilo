'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ban } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ActionDialog } from '@/components/admin/action-dialog';
import { Button } from '@/components/ui/button';
import { useAdminMutation } from '@/lib/hooks/use-admin-mutation';

/**
 * Admin cancel is the support escape hatch. The reason is recorded in the order history and shown to both
 * the customer and the vendor, so the API requires 5–300 characters and so does the dialog.
 *
 * Cancelling also cancels any open pickup or drop job, so nobody is sent out for work that is no longer
 * happening — that is handled server-side; this button just needs to not pretend otherwise.
 */
export function CancelOrderButton({ orderId, orderNo }: { orderId: string; orderNo: string }) {
  const t = useTranslations('orders');
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const mutation = useAdminMutation<unknown, string>({
    request: (reason) => ({ path: `/admin/orders/${orderId}/cancel`, options: { body: { reason } } }),
    successMessage: t('cancelled'),
    invalidate: [['admin', 'orders']],
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        <Ban />
        {t('cancel')}
      </Button>

      <ActionDialog
        open={open}
        onOpenChange={setOpen}
        title={t('cancelTitle')}
        description={t('cancelBody', { orderNo })}
        confirmLabel={t('cancelConfirm')}
        variant="destructive"
        pending={mutation.isPending}
        reason={{ label: t('cancelReasonLabel'), placeholder: t('cancelReasonPlaceholder'), minLength: 5, maxLength: 300 }}
        onConfirm={(reason) => mutation.mutate(reason)}
      />
    </>
  );
}
