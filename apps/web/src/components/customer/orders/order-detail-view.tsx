'use client';

import { Check, MapPin, Navigation, RotateCcw, Store, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { formatMoney } from '@dhoblio/shared';
import { toast } from 'sonner';
import { Link, useRouter } from '@/i18n/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Monogram } from '@/components/customer/ui/monogram';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useCancelOrder,
  useOrderDetail,
  useOrderTimeline,
  useOrderTracking,
  useReorderOrder,
} from '@/lib/customer/hooks/use-orders';
import { useOrderDelivery, useRiderLocation } from '@/lib/customer/hooks/use-deliveries';
import type { OrderTimelineEntry } from '@/lib/customer/types';
import { useVendorDetail } from '@/lib/customer/hooks/use-vendor-detail';
import { formatDateTime, formatSlotRange } from '@/lib/customer/format';
import { OrderStatusBadge } from './order-status-badge';
import { ORDER_FLOW, ProgressBar } from './order-progress';
import { cn } from '@/lib/utils';

export function OrderDetailView({ orderId, placed }: { orderId: string; placed: boolean }) {
  const t = useTranslations('customer.orders');
  const locale = useLocale();
  const order = useOrderDetail(orderId, { refetchInterval: 15_000 });
  const timeline = useOrderTimeline(orderId);
  const vendor = useVendorDetail(order.data?.vendor.id);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const cancelOrder = useCancelOrder();
  const reorderOrder = useReorderOrder();
  const router = useRouter();
  const tracking = useOrderTracking(orderId, !!order.data && order.isSuccess);
  const delivery = useOrderDelivery(orderId);
  const riderLegs = delivery.data?.filter((leg) => leg.handledBy === 'RIDER') ?? [];
  const riderLeg = riderLegs.find((leg) => leg.status === 'IN_TRANSIT') ?? riderLegs[riderLegs.length - 1];
  const rider = riderLeg?.rider;
  const riderStatus = riderLeg?.status;
  const riderLocationQuery = useRiderLocation(orderId, !!riderLeg && riderLeg.status === 'IN_TRANSIT');
  const liveStatus = tracking.last?.to ?? order.data?.status ?? 'PLACED';
  const timelineEntries: OrderTimelineEntry[] = [
    ...(timeline.data ?? []),
    ...tracking.events
      .filter((event) => !timeline.data?.some((entry) => entry.status === event.to && entry.at === event.at))
      .map((event) => ({
        status: event.to,
        from: event.from,
        at: event.at,
        by: event.actor,
        note: event.reason ?? null,
      })),
  ];

  if (order.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 rounded-3xl" />
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }

  if (order.isError || !order.data) {
    return (
      <div className="space-y-3">
        <Alert variant="destructive">
          <AlertDescription>{t('loadError')}</AlertDescription>
        </Alert>
        <Button asChild variant="outline">
          <Link href="/orders">{t('back')}</Link>
        </Button>
      </div>
    );
  }

  const data = order.data;
  const timeZone = vendor.data?.city.timezone ?? 'Asia/Karachi';
  const address = data.addressSnapshot;
  const canCancel = ['PLACED', 'ACCEPTED'].includes(data.status);
  const ended = liveStatus === 'CANCELLED' || liveStatus === 'REJECTED';
  const statusKey = liveStatus.toLowerCase();
  const reachedAt = new Map<string, string>();
  for (const entry of timelineEntries) if (!reachedAt.has(entry.status)) reachedAt.set(entry.status, entry.at);
  if (!reachedAt.has('PLACED')) reachedAt.set('PLACED', data.placedAt);
  const currentIndex = ORDER_FLOW.indexOf(liveStatus as (typeof ORDER_FLOW)[number]);
  const flow: string[] = ended ? [...ORDER_FLOW.filter((step) => reachedAt.has(step)), liveStatus] : [...ORDER_FLOW];

  return (
    <div className="space-y-4 pb-10">
      {placed ? (
        <div className="bg-success/10 border-success/30 animate-pop flex items-center gap-4 rounded-3xl border p-4">
          <span className="dh-ring-pop bg-success text-success-foreground flex size-14 shrink-0 items-center justify-center rounded-full">
            <svg
              viewBox="0 0 24 24"
              className="size-8"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path className="dh-check" d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
          <div>
            <p className="text-success-text text-lg font-semibold">{t('placedTitle')}</p>
            <p className="text-muted-foreground text-sm">{t('placedBanner')}</p>
          </div>
        </div>
      ) : null}

      <section className="bg-card space-y-4 rounded-3xl border p-4 shadow-xs">
        <div className="flex items-start gap-3">
          <Monogram name={data.vendor.businessName} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h1 className="tabular text-lg leading-tight font-semibold tracking-tight whitespace-nowrap">
                {data.orderNo}
              </h1>
              <OrderStatusBadge status={liveStatus} />
            </div>
            <Link
              href={`/vendor/${data.vendor.id}`}
              className="text-muted-foreground hover:text-primary mt-0.5 inline-flex items-center gap-1 text-sm transition-colors"
            >
              <Store className="size-3.5" aria-hidden />
              {data.vendor.businessName}
            </Link>
            <p className="text-muted-foreground text-xs">{formatDateTime(data.placedAt, locale)}</p>
          </div>
        </div>
        {!ended ? <ProgressBar status={liveStatus} /> : null}
        <p className="text-sm font-medium" aria-live="polite">
          {t(`statusHint.${statusKey}`)}
        </p>
      </section>

      <section className="bg-card space-y-3 rounded-2xl border p-4 shadow-xs">
        <h2 className="text-base font-semibold">{t('trackTitle')}</h2>
        {timeline.isLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <ol className="stagger relative space-y-0">
            {flow.map((step, index) => {
              const at = reachedAt.get(step);
              const reached = !!at && (ended || index <= currentIndex);
              const current = step === liveStatus;
              const bad = step === 'CANCELLED' || step === 'REJECTED';
              return (
                <li key={step} className="relative flex gap-3 pb-5 last:pb-0">
                  {index < flow.length - 1 ? (
                    <span
                      aria-hidden
                      className={cn(
                        'absolute start-[0.8125rem] top-7 -bottom-0.5 w-0.5 rounded-full transition-colors duration-500',
                        reached && !current ? 'bg-primary' : 'bg-border',
                      )}
                    />
                  ) : null}
                  <span
                    className={cn(
                      'relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-300',
                      bad && 'bg-destructive border-destructive text-destructive-foreground',
                      !bad && reached && !current && 'bg-primary border-primary text-primary-foreground',
                      !bad && current && 'bg-background border-primary text-primary dh-live',
                      !bad && !reached && 'bg-background border-border text-transparent',
                    )}
                  >
                    {bad ? (
                      <X className="size-3.5" aria-hidden />
                    ) : reached && !current ? (
                      <Check className="size-3.5" aria-hidden />
                    ) : current ? (
                      <span className="bg-primary size-2 rounded-full" />
                    ) : null}
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className={cn('text-sm', reached || current ? 'font-semibold' : 'text-muted-foreground')}>
                        {t(`status.${step.toLowerCase()}`)}
                      </p>
                      <p className="text-muted-foreground tabular text-xs">
                        {at ? formatDateTime(at, locale) : t('pending')}
                      </p>
                    </div>
                    {at && timelineEntries.find((entry) => entry.status === step)?.note ? (
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {timelineEntries.find((entry) => entry.status === step)?.note}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {data.cancelReason || data.rejectionReason ? (
          <Alert variant="destructive">
            <AlertDescription>{data.cancelReason ?? data.rejectionReason}</AlertDescription>
          </Alert>
        ) : null}
      </section>

      {rider ? (
        <section className="bg-card space-y-3 rounded-2xl border p-4 shadow-xs">
          <h2 className="text-base font-semibold">{t('ridersOnTheWay')}</h2>
          <div className="flex items-center gap-3">
            {rider.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={rider.photoUrl} alt={rider.name ?? t('rider')} className="size-12 rounded-full object-cover" />
            ) : (
              <Monogram name={rider.name ?? t('rider')} size="md" className="rounded-full" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{rider.name ?? t('rider')}</p>
              <OrderStatusBadge status={riderStatus ?? 'OUT_FOR_DELIVERY'} />
            </div>
          </div>
          {riderLocationQuery.data ? (
            <a
              href={`https://www.google.com/maps?q=${riderLocationQuery.data.lat},${riderLocationQuery.data.lng}`}
              target="_blank"
              rel="noreferrer"
              className="bg-info/10 text-info-text flex items-center gap-3 rounded-xl p-3 text-sm font-medium transition-colors hover:bg-info/15"
            >
              <span className="dh-live bg-info text-info-foreground flex size-8 items-center justify-center rounded-full">
                <Navigation className="size-4" aria-hidden />
              </span>
              <span className="flex-1">{t('riderLocation')}</span>
              <span className="text-xs underline">{t('openMaps')}</span>
            </a>
          ) : null}
        </section>
      ) : null}

      <section className="bg-card space-y-3 rounded-2xl border p-4 text-sm shadow-xs">
        <h2 className="text-base font-semibold">{t('itemsTitle')}</h2>
        {data.items.map((item) => (
          <div key={item.id} className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">{locale === 'ur' && item.nameUr ? item.nameUr : item.name}</p>
              <p className="text-muted-foreground tabular text-xs">
                {formatMoney(item.unitPrice)} × {item.qty}
              </p>
            </div>
            <span className="tabular font-medium">{formatMoney(item.lineTotal)}</span>
          </div>
        ))}
        <div className="space-y-2 border-t border-dashed pt-3">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('subtotal')}</span>
            <span className="tabular">{formatMoney(data.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('deliveryFee')}</span>
            <span className="tabular">{formatMoney(data.deliveryFee)}</span>
          </div>
          {Number(data.discountTotal) > 0 ? (
            <div className="text-success-text flex justify-between">
              <span>{t('discount')}</span>
              <span className="tabular">-{formatMoney(data.discountTotal)}</span>
            </div>
          ) : null}
          <div className="flex justify-between text-base font-bold">
            <span>{t('total')}</span>
            <span className="tabular">{formatMoney(data.total)}</span>
          </div>
          <p className="text-muted-foreground text-xs">
            {data.paymentMethod === 'COD' ? t('cod') : data.paymentMethod} ·{' '}
            {data.paymentStatus.replaceAll('_', ' ').toLowerCase()}
          </p>
        </div>
      </section>

      <section className="bg-card space-y-3 rounded-2xl border p-4 text-sm shadow-xs">
        <h2 className="text-base font-semibold">{t('scheduleTitle')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="bg-muted/50 rounded-xl p-3">
            <p className="text-muted-foreground text-xs">{t('pickup')}</p>
            <p className="tabular mt-0.5 font-medium">
              {formatSlotRange(data.pickupSlotStart, data.pickupSlotEnd, locale, timeZone)}
            </p>
            <p className="text-muted-foreground text-xs">
              {formatDateTime(data.pickupSlotStart, locale, timeZone).split(',')[0]}
            </p>
          </div>
          <div className="bg-muted/50 rounded-xl p-3">
            <p className="text-muted-foreground text-xs">{t('delivery')}</p>
            <p className="tabular mt-0.5 font-medium">
              {formatSlotRange(data.deliverySlotStart, data.deliverySlotEnd, locale, timeZone)}
            </p>
            <p className="text-muted-foreground text-xs">
              {formatDateTime(data.deliverySlotStart, locale, timeZone).split(',')[0]}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 pt-1">
          <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-full">
            <MapPin className="size-4" aria-hidden />
          </span>
          <div>
            <p className="font-medium">{address.label || address.area || address.line1}</p>
            <p className="text-muted-foreground text-xs">
              {[address.line1, address.line2, address.area].filter(Boolean).join(', ')}
            </p>
          </div>
        </div>
        {data.customerNote ? (
          <p className="bg-muted/50 rounded-xl p-3 text-xs">
            <span className="font-medium">{t('noteTitle')}: </span>
            {data.customerNote}
          </p>
        ) : null}
      </section>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('cancelTitle')}</DialogTitle>
            <DialogDescription>{t('cancelBody', { orderNo: data.orderNo })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-muted-foreground text-sm">{t('cancelReasonLabel')}</label>
            <textarea
              className="border-input bg-background placeholder:text-muted-foreground w-full rounded-md border px-3 py-2 text-sm"
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder={t('cancelReasonPlaceholder')}
              maxLength={200}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              {t('back')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                void (async () => {
                  await cancelOrder.mutateAsync({ orderId: data.id, reason: cancelReason.trim() || undefined });
                  setCancelOpen(false);
                  setCancelReason('');
                  toast.success(t('cancelled'));
                })();
              }}
              disabled={cancelOrder.isPending}
            >
              {t('cancelConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap gap-2">
        {canCancel ? (
          <Button
            variant="outline"
            className="text-destructive rounded-full"
            onClick={() => setCancelOpen(true)}
            disabled={cancelOrder.isPending}
          >
            {t('cancel')}
          </Button>
        ) : null}
        <Button
          variant="outline"
          className="rounded-full"
          disabled={reorderOrder.isPending}
          onClick={() => {
            void reorderOrder
              .mutateAsync({ orderId: data.id })
              .then(() => {
                toast.success(t('reorderDone'));
                router.push('/cart');
              })
              .catch(() => toast.error(t('reorderError')));
          }}
        >
          <RotateCcw className="size-4" aria-hidden />
          {t('reorder')}
        </Button>
        <Button asChild variant="ghost" className="rounded-full">
          <Link href="/orders">{t('back')}</Link>
        </Button>
      </div>
    </div>
  );
}
