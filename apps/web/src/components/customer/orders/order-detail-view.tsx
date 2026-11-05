'use client';

import { CheckCircle2, ReceiptText } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { formatMoney } from '@dhoblio/shared';
import { Link } from '@/i18n/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrderDetail, useOrderTimeline } from '@/lib/customer/hooks/use-orders';
import { useVendorDetail } from '@/lib/customer/hooks/use-vendor-detail';
import { formatDateTime, formatSlotRange } from '@/lib/customer/format';
import { OrderStatusBadge } from './order-status-badge';

export function OrderDetailView({ orderId, placed }: { orderId: string; placed: boolean }) {
  const t = useTranslations('customer.orders');
  const locale = useLocale();
  const order = useOrderDetail(orderId);
  const timeline = useOrderTimeline(orderId);
  const vendor = useVendorDetail(order.data?.vendor.id);

  if (order.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
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

  return (
    <div className="space-y-4 pb-16">
      {placed ? (
        <Alert variant="success">
          <CheckCircle2 aria-hidden />
          <AlertDescription className="text-sm text-foreground">{t('placedBanner')}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{data.orderNo}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {data.vendor.businessName} · {formatDateTime(data.placedAt, locale)}
          </p>
        </div>
        <OrderStatusBadge status={data.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('itemsTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {data.items.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{locale === 'ur' && item.nameUr ? item.nameUr : item.name}</p>
                <p className="text-muted-foreground text-xs">
                  {formatMoney(item.unitPrice)} × {item.qty}
                </p>
              </div>
              <span className="font-medium">{formatMoney(item.lineTotal)}</span>
            </div>
          ))}
          <Separator />
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('subtotal')}</span>
            <span>{formatMoney(data.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('deliveryFee')}</span>
            <span>{formatMoney(data.deliveryFee)}</span>
          </div>
          {Number(data.discountTotal) > 0 ? (
            <div className="flex justify-between text-emerald-600">
              <span>{t('discount')}</span>
              <span>-{formatMoney(data.discountTotal)}</span>
            </div>
          ) : null}
          <div className="flex justify-between text-base font-semibold">
            <span>{t('total')}</span>
            <span>{formatMoney(data.total)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('slotsTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">{t('pickup')}</span>
            <span>{formatSlotRange(data.pickupSlotStart, data.pickupSlotEnd, locale, timeZone)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">{t('delivery')}</span>
            <span>{formatSlotRange(data.deliverySlotStart, data.deliverySlotEnd, locale, timeZone)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('addressTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p className="font-medium">{address.label || address.area || address.line1}</p>
          <p className="text-muted-foreground">
            {[address.line1, address.line2, address.area].filter(Boolean).join(', ')}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('timelineTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {timeline.isLoading ? (
            <Skeleton className="h-16" />
          ) : timeline.data && timeline.data.length > 0 ? (
            timeline.data.map((entry) => (
              <div key={`${entry.status}-${entry.at}`} className="flex items-start gap-3">
                <ReceiptText className="text-muted-foreground mt-0.5 size-4" aria-hidden />
                <div className="flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <OrderStatusBadge status={entry.status} />
                    <span className="text-muted-foreground text-xs">{formatDateTime(entry.at, locale)}</span>
                  </div>
                  {entry.note ? <p className="text-muted-foreground mt-1 text-xs">{entry.note}</p> : null}
                </div>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground">{t('timelineEmpty')}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('paymentTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p>{data.paymentMethod === 'COD' ? t('cod') : data.paymentMethod}</p>
          <p className="text-muted-foreground text-xs">{data.paymentStatus.replaceAll('_', ' ').toLowerCase()}</p>
        </CardContent>
      </Card>

      {data.customerNote ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('noteTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{data.customerNote}</CardContent>
        </Card>
      ) : null}

      {data.cancelReason || data.rejectionReason ? (
        <Alert variant="destructive">
          <AlertDescription>{data.cancelReason ?? data.rejectionReason}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex gap-2">
        <Button asChild variant="outline">
          <Link href="/orders">{t('back')}</Link>
        </Button>
        <Button asChild>
          <Link href="/discovery">{t('browse')}</Link>
        </Button>
      </div>
    </div>
  );
}
