'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Check, RotateCcw, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { VendorStatus } from '@dhoblio/shared';
import { ActionDialog } from '@/components/admin/action-dialog';
import { Button } from '@/components/ui/button';
import { useAdminMutation } from '@/lib/hooks/use-admin-mutation';

type Action = 'approve' | 'reject' | 'suspend' | 'reactivate';

/**
 * Approve / reject / suspend / reactivate.
 *
 * Which buttons show is driven by the vendor's current status, matching the API's own transition rules —
 * the server answers VENDOR_INVALID_TRANSITION for anything else, and offering a button that always fails
 * is worse than not offering it.
 */
export function VendorActions({ vendorId, status }: { vendorId: string; status: VendorStatus }) {
  const t = useTranslations('vendors');
  const router = useRouter();
  const [open, setOpen] = useState<Action | null>(null);

  const mutation = useAdminMutation<unknown, { action: Action; reason: string }>({
    request: ({ action, reason }) => ({
      path: `/admin/vendors/${vendorId}/${action}`,
      // Only reject and suspend take a reason; approve and reactivate send no body.
      options: reason ? { body: { reason } } : {},
    }),
    successMessage: (_r, { action }) =>
      action === 'approve'
        ? t('approved')
        : action === 'reject'
          ? t('rejected')
          : action === 'suspend'
            ? t('suspended')
            : t('reactivated'),
    invalidate: [['admin', 'vendors']],
    onSuccess: () => {
      setOpen(null);
      // The page is a server component, so re-render it to pick up the new status and audit trail.
      router.refresh();
    },
  });

  const canApprove = status === VendorStatus.PENDING;
  const canReject = status === VendorStatus.PENDING;
  const canSuspend = status === VendorStatus.APPROVED;
  const canReactivate = status === VendorStatus.SUSPENDED;

  const dialogs: Record<Action, { title: string; body: string; confirm: string; variant: 'default' | 'destructive' | 'success'; reason?: { label: string; placeholder: string } }> = {
    approve: { title: t('approveTitle'), body: t('approveBody'), confirm: t('approveConfirm'), variant: 'success' },
    reject: {
      title: t('rejectTitle'),
      body: t('rejectBody'),
      confirm: t('rejectConfirm'),
      variant: 'destructive',
      reason: { label: t('reasonLabel'), placeholder: t('reasonPlaceholder') },
    },
    suspend: {
      title: t('suspendTitle'),
      body: t('suspendBody'),
      confirm: t('suspendConfirm'),
      variant: 'destructive',
      reason: { label: t('reasonLabel'), placeholder: t('suspendReasonPlaceholder') },
    },
    reactivate: {
      title: t('reactivateTitle'),
      body: t('reactivateBody'),
      confirm: t('reactivateConfirm'),
      variant: 'success',
    },
  };

  const active = open ? dialogs[open] : null;

  return (
    <>
      {canApprove ? (
        <Button variant="success" onClick={() => setOpen('approve')}>
          <Check />
          {t('approve')}
        </Button>
      ) : null}
      {canReject ? (
        <Button variant="outline" onClick={() => setOpen('reject')}>
          <X />
          {t('reject')}
        </Button>
      ) : null}
      {canSuspend ? (
        <Button variant="destructive" onClick={() => setOpen('suspend')}>
          <Ban />
          {t('suspend')}
        </Button>
      ) : null}
      {canReactivate ? (
        <Button onClick={() => setOpen('reactivate')}>
          <RotateCcw />
          {t('reactivate')}
        </Button>
      ) : null}

      {active && open ? (
        <ActionDialog
          open
          onOpenChange={(next) => !next && setOpen(null)}
          title={active.title}
          description={active.body}
          confirmLabel={active.confirm}
          variant={active.variant}
          pending={mutation.isPending}
          reason={active.reason}
          onConfirm={(reason) => mutation.mutate({ action: open, reason })}
        />
      ) : null}
    </>
  );
}
