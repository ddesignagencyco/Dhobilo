'use client';

import { ArrowRight, Minus, Plus, ShoppingBag, Store, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { formatMoney, fromPaisa } from '@dhoblio/shared';
import { Link, useRouter } from '@/i18n/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Monogram } from '@/components/customer/ui/monogram';
import { useCart } from '@/lib/customer/cart-provider';
import { useEstimate } from '@/lib/customer/hooks/use-estimate';
import { useVendorDetail } from '@/lib/customer/hooks/use-vendor-detail';

export function CartView() {
  const t = useTranslations('customer.cart');
  const locale = useLocale();
  const router = useRouter();
  const { cart, hydrated, updateQuantity, removeItem } = useCart();
  const estimate = useEstimate(cart, cart?.vendorId);
  const vendor = useVendorDetail(cart?.vendorId);

  if (!hydrated) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader title={t('title')} />
        <EmptyState
          className="py-16"
          icon={<ShoppingBag aria-hidden />}
          title={t('empty')}
          description={t('emptyHint')}
          action={
            <Button asChild>
              <Link href="/discovery">{t('browse')}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const lines = estimate.data?.lines ?? [];
  const lineFor = (itemId: string) => lines.find((line) => line.serviceItemId === itemId);
  const vendorName = vendor.data?.businessName ?? estimate.data?.vendor.businessName ?? '';
  const unavailable = estimate.data?.warnings.includes('VENDOR_NOT_ACCEPTING_ORDERS') ?? false;
  const money = (n: number) => formatMoney(fromPaisa(Math.round(n * 100)));

  return (
    <div className="space-y-5 pb-36">
      <PageHeader title={t('title')} />

      {vendorName ? (
        <Link
          href={`/vendor/${cart.vendorId}`}
          className="bg-card hover-lift flex items-center gap-3 rounded-2xl border p-3 shadow-xs"
        >
          <Monogram name={vendorName} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-xs">{t('orderingFrom')}</p>
            <p className="truncate font-semibold">{vendorName}</p>
          </div>
          <span className="text-primary flex items-center gap-1 text-sm font-medium">
            <Store className="size-4" aria-hidden />
            {t('addMore')}
          </span>
        </Link>
      ) : null}

      {vendor.isError || estimate.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t('loadError')}</AlertDescription>
        </Alert>
      ) : null}

      {unavailable ? (
        <Alert variant="warning">
          <AlertDescription>{t('vendorPaused')}</AlertDescription>
        </Alert>
      ) : null}

      <div className="bg-card stagger divide-y overflow-hidden rounded-2xl border shadow-xs">
        {cart.items.map((item) => {
          const line = lineFor(item.itemId);
          const name = line ? (locale === 'ur' && line.nameUr ? line.nameUr : line.name) : item.itemId;
          return (
            <div key={item.itemId} className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{name}</p>
                {line ? (
                  <p className="text-muted-foreground tabular text-xs">
                    {formatMoney(line.unitPrice)} × {item.quantity}
                  </p>
                ) : (
                  <Skeleton className="mt-1 h-3 w-20" />
                )}
              </div>

              <div className="flex flex-col items-end gap-1.5">
                <div className="bg-muted flex items-center gap-0.5 rounded-full p-0.5">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8 rounded-full"
                    onClick={() => updateQuantity(item.itemId, item.quantity - 1)}
                    aria-label={t('decrease')}
                  >
                    <Minus className="size-3.5" aria-hidden />
                  </Button>
                  <span key={item.quantity} className="dh-tick tabular min-w-6 text-center text-sm font-semibold">
                    {item.quantity}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8 rounded-full"
                    onClick={() => updateQuantity(item.itemId, item.quantity + 1)}
                    aria-label={t('increase')}
                  >
                    <Plus className="size-3.5" aria-hidden />
                  </Button>
                </div>
                {line ? <p className="tabular text-sm font-semibold">{formatMoney(line.lineTotal)}</p> : null}
              </div>

              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive size-8"
                onClick={() => removeItem(item.itemId)}
                aria-label={t('remove')}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
          );
        })}
      </div>

      <div className="bg-card space-y-2.5 rounded-2xl border p-4 text-sm shadow-xs">
        {estimate.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        ) : estimate.data ? (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('subtotal')}</span>
              <span className="tabular">{formatMoney(estimate.data.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('deliveryFee')}</span>
              <span className="tabular">{formatMoney(estimate.data.deliveryFee)}</span>
            </div>
            {Number(estimate.data.discountTotal) > 0 ? (
              <div className="text-success-text flex justify-between">
                <span>{t('discount')}</span>
                <span className="tabular">-{formatMoney(estimate.data.discountTotal)}</span>
              </div>
            ) : null}
            <div className="border-t border-dashed pt-3 text-base font-semibold">
              <div className="flex items-baseline justify-between">
                <span>{t('total')}</span>
                <span className="text-lg">
                  <AnimatedNumber value={Number(estimate.data.total)} format={money} duration={600} />
                </span>
              </div>
              <p className="text-muted-foreground mt-1 text-xs font-normal">{t('payOnDelivery')}</p>
            </div>
          </>
        ) : (
          <p className="text-muted-foreground">{t('estimatePending')}</p>
        )}
      </div>

      <div className="safe-bottom dh-slide-up pointer-events-none fixed inset-x-0 bottom-[4.75rem] z-20 px-4">
        <div className="pointer-events-auto mx-auto flex w-full max-w-3xl">
          <Button
            size="lg"
            className="h-12 w-full rounded-2xl text-base shadow-lg"
            onClick={() => router.push('/checkout')}
            disabled={!estimate.data || estimate.isFetching || unavailable}
          >
            {t('checkout')}
            <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
