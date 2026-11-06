'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useRejectOrder } from '@/lib/vendor/hooks/use-vendor-orders';

export function RejectDialog({
  orderId,
  orderNo,
  open,
  onOpenChange,
  onDone,
}: {
  orderId: string;
  orderNo: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  const t = useTranslations('vendor.orders');
  const reject = useRejectOrder();
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();

  async function submit() {
    try {
      await reject.mutateAsync({ orderId, reason: trimmed });
      toast.success(t('rejected'));
      setReason('');
      onOpenChange(false);
      onDone?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('actionFailed'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('rejectTitle', { orderNo })}</DialogTitle>
          <DialogDescription>{t('rejectBody')}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('rejectPlaceholder')}
          aria-label={t('rejectReason')}
          maxLength={300}
          rows={3}
        />
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={reject.isPending}>
            {t('cancel')}
          </Button>
          <Button variant="destructive" onClick={submit} disabled={trimmed.length < 3 || reject.isPending}>
            {reject.isPending ? t('rejecting') : t('reject')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
