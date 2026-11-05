'use client';

import { Minus, Plus, Star, MapPin } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { formatMoney } from '@dhoblio/shared';
import { useRouter } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CartSummary } from '@/components/customer/cart/cart-summary';
import { useCart } from '@/lib/customer/cart-provider';
import { useEstimate } from '@/lib/customer/hooks/use-estimate';
import type { PublicVendorDetail, VendorCatalog } from '@/lib/customer/types';

function QuantityStepper({
  quantity,
  onDecrease,
  onIncrease,
}: {
  quantity: number;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  const t = useTranslations('customer.vendor');
  return (
    <div className="bg-primary text-primary-foreground flex items-center gap-1 rounded-full p-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-primary-foreground hover:bg-primary-foreground/15 size-7 rounded-full"
        onClick={onDecrease}
        aria-label={t('decrease')}
      >
        <Minus className="size-3.5" aria-hidden />
      </Button>
      <span className="min-w-5 text-center text-sm font-semibold" aria-live="polite">
        {quantity}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-primary-foreground hover:bg-primary-foreground/15 size-7 rounded-full"
        onClick={onIncrease}
        aria-label={t('increase')}
      >
        <Plus className="size-3.5" aria-hidden />
      </Button>
    </div>
  );
}

export function VendorCatalog({
  vendor,
  catalog,
}: {
  vendor: PublicVendorDetail;
  catalog: VendorCatalog;
}) {
  const t = useTranslations('customer.vendor');
  const locale = useLocale();
  const router = useRouter();
  const { cart, hydrated, addItem, updateQuantity, removeItem } = useCart();

  const ownCart = cart?.vendorId === vendor.id ? cart : null;
  const estimate = useEstimate(ownCart, vendor.id);

  const quantityFor = (itemId: string) =>
    ownCart?.items.find((item) => item.itemId === itemId)?.quantity ?? 0;

  const changeQuantity = (itemId: string, quantity: number) => {
    if (quantity <= 0) removeItem(itemId);
    else if (quantityFor(itemId) === 0) addItem(vendor.id, itemId, quantity);
    else updateQuantity(itemId, quantity);
  };

  return (
    <div className="space-y-6 pb-40">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{vendor.businessName}</h1>
          <Badge variant={vendor.openNow ? 'default' : 'secondary'}>
            {vendor.openNow ? t('open') : t('closed')}
          </Badge>
        </div>
        {vendor.description ? <p className="text-muted-foreground mt-1 text-sm">{vendor.description}</p> : null}
        <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-4 text-sm">
          <span className="flex items-center gap-1">
            <Star className="size-4 fill-yellow-400 text-yellow-400" aria-hidden />
            {Number(vendor.ratingAvg).toFixed(1)}
            <span className="text-xs">({vendor.ratingCount})</span>
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="size-4" aria-hidden />
            {t('radius', { km: vendor.serviceRadiusKm })}
          </span>
          <span>{t('turnaround', { hours: vendor.minTurnaroundHours ?? 0 })}</span>
        </div>
        {vendor.addressLine ? <p className="text-muted-foreground mt-1 text-xs">{vendor.addressLine}</p> : null}
      </div>

      {!vendor.openNow ? (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-3 text-sm">
          {t('closedNotice')}
        </div>
      ) : null}

      {catalog.categories.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">{t('emptyCatalog')}</p>
      ) : (
        catalog.categories.map((category) => (
          <section key={category.id} className="space-y-3">
            <h2 className="text-lg font-semibold">{locale === 'ur' ? category.nameUr : category.name}</h2>
            <div className="space-y-2">
              {category.items.map((item) => {
                const quantity = quantityFor(item.id);
                return (
                  <Card key={item.id}>
                    <CardContent className="flex items-center gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {locale === 'ur' && item.itemNameUr ? item.itemNameUr : item.itemName}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {t('itemTurnaround', { hours: item.turnaroundHours })}
                        </p>
                      </div>
                      <span className="text-sm font-semibold">{formatMoney(item.price)}</span>
                      {!hydrated ? (
                        <Skeleton className="h-8 w-24 rounded-full" />
                      ) : quantity > 0 ? (
                        <QuantityStepper
                          quantity={quantity}
                          onDecrease={() => changeQuantity(item.id, quantity - 1)}
                          onIncrease={() => changeQuantity(item.id, quantity + 1)}
                        />
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          disabled={!vendor.openNow}
                          onClick={() => changeQuantity(item.id, 1)}
                        >
                          {t('add')}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        ))
      )}

      <CartSummary
        cart={ownCart}
        estimate={estimate.data ?? null}
        isEstimating={estimate.isFetching}
        onCheckout={() => router.push('/cart')}
      />
    </div>
  );
}
