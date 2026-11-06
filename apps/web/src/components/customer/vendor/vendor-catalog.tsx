'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bike, Clock, MapPin, Minus, Plus, Timer } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { formatMoney } from '@dhoblio/shared';
import { useRouter } from '@/i18n/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { CartSidebar } from '@/components/customer/cart/cart-sidebar';
import { CartSummary } from '@/components/customer/cart/cart-summary';
import { Monogram } from '@/components/customer/ui/monogram';
import { RatingPill } from '@/components/customer/ui/rating';
import { serviceIcon } from '@/components/customer/service-types';
import { useCart } from '@/lib/customer/cart-provider';
import { useEstimate } from '@/lib/customer/hooks/use-estimate';
import { todayHours } from '@/lib/customer/hours';
import type { PublicVendorDetail, VendorCatalog } from '@/lib/customer/types';
import { cn } from '@/lib/utils';

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
    <div className="bg-primary text-primary-foreground animate-pop flex items-center gap-0.5 rounded-full p-0.5 shadow-sm">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground size-8 rounded-full"
        onClick={onDecrease}
        aria-label={t('decrease')}
      >
        <Minus className="size-3.5" aria-hidden />
      </Button>
      <span key={quantity} className="dh-tick tabular min-w-6 text-center text-sm font-semibold" aria-live="polite">
        {quantity}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground size-8 rounded-full"
        onClick={onIncrease}
        aria-label={t('increase')}
      >
        <Plus className="size-3.5" aria-hidden />
      </Button>
    </div>
  );
}

function Fact({ icon: Icon, children }: { icon: typeof Clock; children: React.ReactNode }) {
  return (
    <div className="bg-muted/60 flex items-center gap-2 rounded-xl px-3 py-2 text-xs">
      <Icon className="text-primary size-4 shrink-0" aria-hidden />
      <span className="min-w-0 font-medium">{children}</span>
    </div>
  );
}

export function VendorCatalog({ vendor, catalog }: { vendor: PublicVendorDetail; catalog: VendorCatalog }) {
  const t = useTranslations('customer.vendor');
  const ts = useTranslations('customer.services');
  const td = useTranslations('customer.discovery');
  const locale = useLocale();
  const router = useRouter();
  const { cart, hydrated, addItem, updateQuantity, removeItem } = useCart();
  const [activeCategory, setActiveCategory] = useState<number | null>(catalog.categories[0]?.id ?? null);
  const tabsRef = useRef<HTMLDivElement>(null);

  const ownCart = cart?.vendorId === vendor.id ? cart : null;
  const estimate = useEstimate(ownCart, vendor.id);

  const quantityFor = (itemId: string) => ownCart?.items.find((item) => item.itemId === itemId)?.quantity ?? 0;

  const changeQuantity = (itemId: string, quantity: number) => {
    if (quantity <= 0) removeItem(itemId);
    else if (quantityFor(itemId) === 0) addItem(vendor.id, itemId, quantity);
    else updateQuantity(itemId, quantity);
  };

  const hours = useMemo(() => todayHours(vendor.hours, vendor.city.timezone, locale), [vendor, locale]);

  useEffect(() => {
    const sections = catalog.categories
      .map((category) => document.getElementById(`cat-${category.id}`))
      .filter((node): node is HTMLElement => !!node);
    if (sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveCategory(Number(visible.target.id.replace('cat-', '')));
      },
      { rootMargin: '-110px 0px -60% 0px' },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [catalog.categories]);

  useEffect(() => {
    const tab = tabsRef.current?.querySelector<HTMLElement>(`[data-cat="${activeCategory}"]`);
    tab?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [activeCategory]);

  const categoryName = (category: { name: string; nameUr: string }) =>
    locale === 'ur' ? category.nameUr : category.name;

  return (
    <div className="space-y-5 pb-32 lg:space-y-6 lg:pb-0">
      <section className="bg-card space-y-4 rounded-3xl border p-4 shadow-xs md:p-6">
        <div className="flex items-start gap-4">
          <Monogram name={vendor.businessName} size="lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={vendor.openNow ? 'success' : 'muted'}>
                <span className={cn('size-1.5 rounded-full', vendor.openNow ? 'bg-success' : 'bg-muted-foreground')} />
                {vendor.openNow ? t('open') : t('closed')}
              </Badge>
              <RatingPill value={Number(vendor.ratingAvg)} count={vendor.ratingCount} newLabel={td('new')} />
            </div>
            <h1
              dir="auto"
              className="text-xl leading-snug font-semibold tracking-tight text-balance text-start md:text-2xl"
            >
              {vendor.businessName}
            </h1>
            {vendor.addressLine ? (
              <p className="text-muted-foreground flex items-start gap-1 text-xs">
                <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {vendor.addressLine}
              </p>
            ) : null}
          </div>
        </div>

        {vendor.description ? (
          <p dir="auto" className="text-muted-foreground text-sm text-start">
            {vendor.description}
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Fact icon={Clock}>
            {hours.kind === 'allDay'
              ? t('open24')
              : hours.kind === 'range'
                ? t('todayHours', { from: hours.from, to: hours.to })
                : t('closedToday')}
          </Fact>
          <Fact icon={Timer}>{t('turnaround', { hours: vendor.minTurnaroundHours ?? 0 })}</Fact>
          <Fact icon={Bike}>
            {t('deliveryFee', { fee: formatMoney(vendor.city.deliveryFee, { decimals: false }) })}
          </Fact>
          <Fact icon={MapPin}>{t('radius', { km: vendor.serviceRadiusKm })}</Fact>
        </div>

        {vendor.serviceTypes.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {vendor.serviceTypes.map((type) => {
              const Icon = serviceIcon(type);
              return (
                <span
                  key={type}
                  className="bg-accent text-accent-foreground inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                >
                  <Icon className="size-3.5" aria-hidden />
                  {ts(type)}
                </span>
              );
            })}
          </div>
        ) : null}
      </section>

      {!vendor.openNow ? (
        <Alert variant="warning">
          <AlertDescription>{t('closedNotice')}</AlertDescription>
        </Alert>
      ) : null}

      {catalog.categories.length === 0 ? (
        <EmptyState title={t('emptyCatalog')} />
      ) : (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0 space-y-5">
            {catalog.categories.length > 1 ? (
              <div className="bg-background/90 sticky top-12 z-10 -mx-4 border-b px-4 backdrop-blur-md sm:-mx-6 sm:px-6 md:top-14 lg:mx-0 lg:rounded-xl lg:border lg:px-2">
                <div ref={tabsRef} className="no-scrollbar flex gap-1 overflow-x-auto py-2" role="tablist">
                  {catalog.categories.map((category) => {
                    const active = category.id === activeCategory;
                    return (
                      <button
                        key={category.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        data-cat={category.id}
                        onClick={() => {
                          setActiveCategory(category.id);
                          document
                            .getElementById(`cat-${category.id}`)
                            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                        className={cn(
                          'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-200 active:scale-95',
                          active
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:bg-accent',
                        )}
                      >
                        {categoryName(category)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="space-y-6">
              {catalog.categories.map((category) => (
                <section key={category.id} id={`cat-${category.id}`} className="scroll-mt-28 space-y-2 lg:scroll-mt-36">
                  <h2 className="text-base font-semibold">{categoryName(category)}</h2>
                  <div className="bg-card divide-y overflow-hidden rounded-2xl border shadow-xs">
                    {category.items.map((item) => {
                      const quantity = quantityFor(item.id);
                      return (
                        <div
                          key={item.id}
                          className={cn(
                            'flex items-center gap-3 p-3.5 transition-colors duration-300',
                            quantity > 0 && 'bg-primary/[0.04]',
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">
                              {locale === 'ur' && item.itemNameUr ? item.itemNameUr : item.itemName}
                            </p>
                            <p className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
                              <span className="tabular font-semibold text-foreground">{formatMoney(item.price)}</span>
                              <span aria-hidden>·</span>
                              <span>{t('itemTurnaround', { hours: item.turnaroundHours })}</span>
                            </p>
                          </div>
                          {!hydrated ? (
                            <Skeleton className="h-9 w-24 rounded-full" />
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
                              variant="outline"
                              className="text-primary border-primary/40 hover:bg-primary hover:text-primary-foreground rounded-full px-4 font-semibold"
                              disabled={!vendor.openNow}
                              onClick={() => changeQuantity(item.id, 1)}
                            >
                              <Plus className="size-3.5" aria-hidden />
                              {t('add')}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>

          <aside className="sticky top-24 hidden lg:block">
            <CartSidebar
              cart={ownCart}
              estimate={estimate.data ?? null}
              isEstimating={estimate.isFetching}
              onCheckout={() => router.push('/cart')}
            />
          </aside>
        </div>
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
