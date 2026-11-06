'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  ArrowLeftIcon,
  BanknoteIcon,
  CalendarClockIcon,
  CheckIcon,
  MapPinIcon,
  PackageCheckIcon,
  TruckIcon,
  XIcon,
} from 'lucide-react';
import { formatMoney } from '@dhoblio/shared';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ShopAvatar } from '../shop-avatar';
import {
  type VendorOrderStatus,
  useAcceptOrder,
  useAdvanceOrder,
  useVendorOrderDetail,
} from '@/lib/vendor/hooks/use-vendor-orders';
import { Countdown, SlotText, StatusBadge, formatStamp } from './order-helpers';
import { RejectDialog } from './reject-dialog';

export function OrderDetail({ orderId }: { orderId: string }) {
  const t = useTranslations('vendor.orders');
  const locale = useLocale();
  const order = useVendorOrderDetail(orderId);
  const accept = useAcceptOrder();
  const advance = useAdvanceOrder();
  const [rejectOpen, setRejectOpen] = useState(false);

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : t('actionFailed'));
    }
  }

  const back = (
    <Link href="/shop/orders" className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline">
      <ArrowLeftIcon className="size-4 rtl:rotate-180" />
      {t('backToBoard')}
    </Link>
  );

  if (order.isLoading) {
    return (
      <div className="space-y-4">
        {back}
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (order.isError || !order.data) {
    return (
      <div className="space-y-4">
        {back}
        <div role="alert" className="border-destructive/40 rounded-lg border p-4 text-sm">
          <p className="mb-2">{order.error instanceof Error ? order.error.message : t('loadFailed')}</p>
          <Button size="sm" variant="outline" onClick={() => order.refetch()}>
            {t('retry')}
          </Button>
        </div>
      </div>
    );
  }

  const o = order.data;
  const actions = o.nextActions.filter((s): s is VendorOrderStatus => s !== 'REJECTED' && s !== 'CANCELLED');
  const canAcceptReject = o.status === 'PLACED' && o.nextActions.includes('ACCEPTED');
  const itemName = (i: (typeof o.items)[number]) => (locale === 'ur' && i.nameUr ? i.nameUr : i.name);

  return (
    <div className="space-y-6">
      {back}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 dir="ltr" className="tabular text-2xl font-semibold tracking-tight">
            {o.orderNo}
          </h1>
          <StatusBadge status={o.status} />
        </div>
        {o.status === 'PLACED' && <Countdown until={o.vendorRespondBy} />}
      </div>

      {(canAcceptReject || actions.length > 0) && (
        <div className="bg-card animate-pop sticky top-16 z-10 flex flex-wrap gap-2 rounded-xl border p-3 shadow-sm">
          {canAcceptReject && (
            <>
              <Button disabled={accept.isPending} onClick={() => run(() => accept.mutateAsync(o.id), t('accepted'))}>
                <CheckIcon />
                {t('accept')}
              </Button>
              <Button variant="outline" className="hover:text-destructive" onClick={() => setRejectOpen(true)}>
                <XIcon />
                {t('reject')}
              </Button>
            </>
          )}
          {!canAcceptReject &&
            actions.map((s) => (
              <Button
                key={s}
                disabled={advance.isPending}
                onClick={() => run(() => advance.mutateAsync({ orderId: o.id, status: s }), t('updated'))}
              >
                <PackageCheckIcon />
                {t(`advance.${s}`)}
              </Button>
            ))}
        </div>
      )}

      <div className="stagger grid items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="bg-card overflow-hidden rounded-xl border shadow-xs">
            <h2 className="border-b px-5 py-4 font-semibold">{t('itemsTitle')}</h2>
            <ul className="divide-y">
              {o.items.map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium">{itemName(i)}</span>
                    <span className="text-muted-foreground tabular block">
                      {i.qty} × {formatMoney(i.unitPrice)}
                    </span>
                  </span>
                  <span className="tabular shrink-0 font-medium">{formatMoney(i.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <dl className="bg-muted/40 space-y-1.5 border-t px-5 py-4 text-sm">
              <Row label={t('subtotal')} value={formatMoney(o.subtotal)} />
              <Row label={t('deliveryFee')} value={formatMoney(o.deliveryFee)} />
              <Row label={t('total')} value={formatMoney(o.total)} strong />
              <Row label={t('commission')} value={`− ${formatMoney(o.commissionAmount)}`} />
              <div className="bg-accent/60 text-accent-foreground -mx-2 mt-2 flex justify-between gap-3 rounded-lg px-2 py-2 text-base font-semibold">
                <dt>{t('yourEarning')}</dt>
                <dd className="tabular">{formatMoney(o.vendorEarning)}</dd>
              </div>
            </dl>
          </section>

          <section className="bg-card rounded-xl border p-5 shadow-xs">
            <h2 className="mb-4 font-semibold">{t('timeline')}</h2>
            <ol className="relative space-y-4 ps-6">
              <span aria-hidden className="bg-border absolute inset-y-1 start-[7px] w-px" />
              {o.timeline.map((e, idx) => {
                const last = idx === o.timeline.length - 1;
                return (
                  <li key={idx} className="relative flex flex-wrap items-center justify-between gap-2">
                    <span
                      aria-hidden
                      className={cn(
                        'absolute -start-6 size-3.5 rounded-full border-2',
                        last ? 'border-primary bg-primary ring-primary/20 ring-4' : 'border-border bg-card',
                      )}
                    />
                    <StatusBadge status={e.status} />
                    <span className="text-muted-foreground tabular text-xs">{formatStamp(e.at, locale)}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>

        <div className="space-y-6">
          <section className="bg-card space-y-3 rounded-xl border p-5 shadow-xs">
            <h2 className="font-semibold">{t('customer')}</h2>
            <div className="flex items-center gap-3">
              <ShopAvatar name={o.customer.name ?? t('customer')} rounded="rounded-full" className="size-10" />
              <div className="min-w-0">
                <p className="truncate font-medium">{o.customer.name ?? '—'}</p>
                {o.customer.phone && (
                  <p dir="ltr" className="text-muted-foreground tabular text-start text-sm">
                    {o.customer.phone}
                  </p>
                )}
              </div>
            </div>
            <p className="text-muted-foreground flex gap-2 text-sm">
              <MapPinIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
              {[o.addressSnapshot.line1, o.addressSnapshot.line2, o.addressSnapshot.area].filter(Boolean).join(', ')}
            </p>
            {o.customerNote && (
              <p className="bg-muted rounded-lg p-3 text-sm">
                <span className="font-medium">{t('note')}: </span>
                {o.customerNote}
              </p>
            )}
          </section>

          <section className="bg-card space-y-3 rounded-xl border p-5 shadow-xs">
            <h2 className="font-semibold">{t('slots')}</h2>
            <div className="space-y-2 text-sm">
              <p className="flex gap-2">
                <CalendarClockIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  <span className="text-muted-foreground block text-xs">{t('pickup')}</span>
                  <SlotText start={o.pickupSlotStart} end={o.pickupSlotEnd} locale={locale} />
                </span>
              </p>
              <p className="flex gap-2">
                <TruckIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  <span className="text-muted-foreground block text-xs">{t('delivery')}</span>
                  <SlotText start={o.deliverySlotStart} end={o.deliverySlotEnd} locale={locale} />
                </span>
              </p>
              <p className="flex gap-2">
                <BanknoteIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  <span className="text-muted-foreground block text-xs">{t('payment')}</span>
                  {o.paymentMethod}
                </span>
              </p>
            </div>
            {(o.rejectionReason || o.cancelReason) && (
              <p className="text-destructive text-sm">{o.rejectionReason ?? o.cancelReason}</p>
            )}
          </section>
        </div>
      </div>

      <RejectDialog orderId={o.id} orderNo={o.orderNo} open={rejectOpen} onOpenChange={setRejectOpen} />
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? 'font-semibold' : 'text-muted-foreground'}`}>
      <dt>{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}
