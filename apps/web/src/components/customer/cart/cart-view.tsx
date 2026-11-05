'use client';

import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { formatMoney } from '@dhoblio/shared';
import { Link, useRouter } from '@/i18n/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
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
      <div className="space-y-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <Card>
          <CardHeader>
            <div className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-xl">
              <ShoppingBag className="size-5" aria-hidden />
            </div>
            <CardTitle className="text-base">{t('empty')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/discovery">{t('browse')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const lines = estimate.data?.lines ?? [];
  const lineFor = (itemId: string) => lines.find((line) => line.serviceItemId === itemId);
  const vendorName = vendor.data?.businessName ?? estimate.data?.vendor.businessName ?? '';
  const unavailable = estimate.data?.warnings.includes('VENDOR_NOT_ACCEPTING_ORDERS') ?? false;

  return (
    <div className="space-y-4 pb-36">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        {vendorName ? (
          <p className="text-muted-foreground mt-1 text-sm">
            {t('fromVendor', { vendor: vendorName })}{' '}
            <Link href={`/vendor/${cart.vendorId}`} className="text-primary underline-offset-4 hover:underline">
              {t('changeVendor')}
            </Link>
          </p>
        ) : null}
      </div>

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

      <Card>
        <CardContent className="divide-y p-0">
          {cart.items.map((item) => {
            const line = lineFor(item.itemId);
            const name = line ? (locale === 'ur' && line.nameUr ? line.nameUr : line.name) : item.itemId;
            return (
              <div key={item.itemId} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{name}</p>
                  {line ? (
                    <p className="text-muted-foreground text-xs">
                      {formatMoney(line.unitPrice)} × {item.quantity}
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-xs">{t('loadingLine')}</p>
                  )}
                  {line ? (
                    <p className="mt-1 text-sm font-semibold">{formatMoney(line.lineTotal)}</p>
                  ) : null}
                </div>

                <div className="bg-muted flex items-center gap-1 rounded-full p-0.5">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7 rounded-full"
                    onClick={() => updateQuantity(item.itemId, item.quantity - 1)}
                    aria-label={t('decrease')}
                  >
                    <Minus className="size-3.5" aria-hidden />
                  </Button>
                  <span className="min-w-5 text-center text-sm font-semibold">{item.quantity}</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7 rounded-full"
                    onClick={() => updateQuantity(item.itemId, item.quantity + 1)}
                    aria-label={t('increase')}
                  >
                    <Plus className="size-3.5" aria-hidden />
                  </Button>
                </div>

                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="text-muted-foreground size-8"
                  onClick={() => removeItem(item.itemId)}
                  aria-label={t('remove')}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-4 text-sm">
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
                <span>{formatMoney(estimate.data.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('deliveryFee')}</span>
                <span>{formatMoney(estimate.data.deliveryFee)}</span>
              </div>
              {Number(estimate.data.discountTotal) > 0 ? (
                <div className="flex justify-between text-emerald-600">
                  <span>{t('discount')}</span>
                  <span>-{formatMoney(estimate.data.discountTotal)}</span>
                </div>
              ) : null}
              <Separator />
              <div className="flex justify-between text-base font-semibold">
                <span>{t('total')}</span>
                <span>{formatMoney(estimate.data.total)}</span>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">{t('estimatePending')}</p>
          )}
        </CardContent>
      </Card>

      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed inset-x-0 bottom-14 z-20 border-t backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3">
          <Button asChild variant="outline">
            <Link href={`/vendor/${cart.vendorId}`}>{t('addMore')}</Link>
          </Button>
          <Button
            className="ms-auto flex-1 sm:flex-none"
            onClick={() => router.push('/checkout')}
            disabled={!estimate.data || estimate.isFetching || unavailable}
          >
            {t('checkout')}
          </Button>
        </div>
      </div>
    </div>
  );
}
