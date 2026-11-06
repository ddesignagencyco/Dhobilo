'use client';

import { useEffect, useMemo, useState } from 'react';
import { Banknote, Check, CheckCircle2, Loader2, MapPin, Plus, Wallet } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { formatMoney, fromPaisa } from '@dhoblio/shared';
import { Link, useRouter } from '@/i18n/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Steps } from '@/components/customer/ui/steps';
import { cn } from '@/lib/utils';
import { AddressForm } from '@/components/customer/address/address-form';
import { useCart } from '@/lib/customer/cart-provider';
import { useAddresses } from '@/lib/customer/hooks/use-addresses';
import { useEstimate } from '@/lib/customer/hooks/use-estimate';
import { usePlaceOrder } from '@/lib/customer/hooks/use-orders';
import { useSlots } from '@/lib/customer/hooks/use-slots';
import { useVendorDetail } from '@/lib/customer/hooks/use-vendor-detail';
import { addDays, formatDayLabel, formatSlotRange, todayInTimeZone } from '@/lib/customer/format';
import type { SlotWindow } from '@/lib/customer/types';

const CHECKOUT_KEY = 'dhoblio:checkout-idempotency';

function newKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `ck_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function keyForFingerprint(fingerprint: string): string {
  if (!fingerprint || typeof window === 'undefined') return '';
  try {
    const stored = sessionStorage.getItem(CHECKOUT_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as { fingerprint?: string; key?: string };
      if (parsed.fingerprint === fingerprint && parsed.key) return parsed.key;
    }
  } catch {
    // broken storage: fall through to a fresh key
  }
  const next = newKey();
  try {
    sessionStorage.setItem(CHECKOUT_KEY, JSON.stringify({ fingerprint, key: next }));
  } catch {
    // private mode: the in-memory key still makes retries in this tab safe
  }
  return next;
}

function Section({
  step,
  title,
  done,
  children,
}: {
  step: number;
  title: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card space-y-4 rounded-2xl border p-4 shadow-xs">
      <h2 className="flex items-center gap-2.5 text-base font-semibold">
        <span
          className={cn(
            'flex size-6 items-center justify-center rounded-full text-xs font-bold transition-colors duration-300',
            done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
          )}
        >
          {done ? <Check className="dh-tick size-3.5" aria-hidden /> : step}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function DayChips({
  days,
  value,
  onChange,
  locale,
  timeZone,
}: {
  days: string[];
  value: string;
  onChange: (day: string) => void;
  locale: string;
  timeZone: string;
}) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="radiogroup">
      {days.map((day) => {
        const selected = day === value;
        const [weekday = '', ...rest] = formatDayLabel(day, locale, timeZone).split(/[,\s]+/);
        return (
          <button
            key={day}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(day)}
            className={cn(
              'flex w-16 shrink-0 flex-col items-center gap-0.5 rounded-2xl border px-2 py-2.5 transition-all duration-200 active:scale-95',
              selected ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-card hover:bg-accent',
            )}
          >
            <span className={cn('text-[11px] font-medium', !selected && 'text-muted-foreground')}>{weekday}</span>
            <span className="tabular text-sm font-semibold">{rest.join(' ')}</span>
          </button>
        );
      })}
    </div>
  );
}

function SlotPicker({
  slots,
  value,
  onChange,
  locale,
  timeZone,
  emptyLabel,
}: {
  slots: SlotWindow[];
  value: string;
  onChange: (start: string) => void;
  locale: string;
  timeZone: string;
  emptyLabel: string;
}) {
  if (slots.length === 0) {
    return <p className="text-muted-foreground bg-muted/50 rounded-xl p-3 text-sm">{emptyLabel}</p>;
  }

  return (
    <div className="stagger grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup">
      {slots.map((slot) => {
        const selected = slot.start === value;
        return (
          <button
            key={slot.start}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={!slot.available}
            onClick={() => onChange(slot.start)}
            className={cn(
              'tabular flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-[13px] font-medium whitespace-nowrap transition-all duration-200 active:scale-95',
              selected
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'bg-card hover:bg-accent hover:border-primary/40',
              !slot.available && 'text-muted-foreground bg-muted/40 pointer-events-none line-through opacity-50',
            )}
          >
            {selected ? <Check className="size-3.5" aria-hidden /> : null}
            <bdi dir="ltr">{formatSlotRange(slot.start, slot.end, locale, timeZone)}</bdi>
          </button>
        );
      })}
    </div>
  );
}

export function CheckoutView() {
  const t = useTranslations('customer.checkout');
  const locale = useLocale();
  const router = useRouter();
  const { cart, hydrated, clearCart } = useCart();
  const estimate = useEstimate(cart, cart?.vendorId);
  const vendor = useVendorDetail(cart?.vendorId);
  const addresses = useAddresses();
  const placeOrder = usePlaceOrder();

  const [addressId, setAddressId] = useState('');
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [pickupDate, setPickupDate] = useState('');
  const [pickupStart, setPickupStart] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryStart, setDeliveryStart] = useState('');
  const [note, setNote] = useState('');

  const fingerprint = useMemo(
    () =>
      cart
        ? `${cart.vendorId}|${cart.items
            .map((item) => `${item.itemId}:${item.quantity}`)
            .sort()
            .join(',')}`
        : '',
    [cart],
  );
  const idempotencyKey = useMemo(() => keyForFingerprint(fingerprint), [fingerprint]);

  const timeZone = vendor.data?.city.timezone ?? 'Asia/Karachi';
  const today = todayInTimeZone(timeZone);
  const effectivePickupDate = pickupDate || today;
  const turnaroundDays = Math.floor((estimate.data?.maxTurnaroundHours ?? 0) / 24);
  const effectiveDeliveryDate = deliveryDate || addDays(effectivePickupDate, turnaroundDays);
  const pickupDays = useMemo(() => Array.from({ length: 8 }, (_, index) => addDays(today, index)), [today]);
  const deliveryDays = useMemo(
    () => Array.from({ length: 8 }, (_, index) => addDays(effectivePickupDate, turnaroundDays + index)),
    [effectivePickupDate, turnaroundDays],
  );

  const defaultAddress = addresses.data?.find((address) => address.isDefault) ?? addresses.data?.[0];
  const effectiveAddressId = addressId || defaultAddress?.id || '';

  const pickupSlots = useSlots(cart?.vendorId, effectivePickupDate, 'pickup');
  const pickupSlot = pickupSlots.data?.slots.find((slot) => slot.start === pickupStart) ?? null;

  const deliverySlots = useSlots(cart?.vendorId, effectiveDeliveryDate, 'delivery', {
    turnaroundHours: estimate.data?.maxTurnaroundHours ?? null,
    pickupEnd: pickupSlot?.end ?? null,
  });

  useEffect(() => {
    if (placeOrder.error && (placeOrder.error as { code?: string }).code === 'PRICE_CHANGED') {
      void estimate.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeOrder.error]);

  const estimatedTotal = estimate.data?.total;
  const canPlace =
    !!cart &&
    cart.items.length > 0 &&
    !!effectiveAddressId &&
    !!pickupStart &&
    !!deliveryStart &&
    !!estimatedTotal &&
    !!idempotencyKey &&
    !placeOrder.isPending;

  const place = async () => {
    if (!cart || !estimatedTotal || !idempotencyKey) return;
    try {
      const order = await placeOrder.mutateAsync({
        idempotencyKey,
        vendorId: cart.vendorId,
        addressId: effectiveAddressId,
        items: cart.items.map((item) => ({ serviceItemId: item.itemId, qty: item.quantity })),
        pickupSlotStart: pickupStart,
        deliverySlotStart: deliveryStart,
        paymentMethod: 'COD',
        expectedTotal: estimatedTotal,
        customerNote: note.trim() || undefined,
      });
      sessionStorage.removeItem(CHECKOUT_KEY);
      clearCart();
      router.push(`/orders/${order.id}?placed=1`);
    } catch {
      // The mutation state renders the error below.
    }
  };

  if (!hydrated || vendor.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-8 w-full rounded-full" />
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader title={t('title')} />
        <EmptyState
          className="py-16"
          title={t('empty')}
          action={
            <Button asChild>
              <Link href="/discovery">{t('browse')}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const addressMissing = !addresses.isLoading && (!addresses.data || addresses.data.length === 0);
  const addressDone = !!effectiveAddressId;
  const scheduleDone = !!pickupStart && !!deliveryStart;
  const currentStep = !addressDone ? 0 : !scheduleDone ? 1 : 2;
  const money = (n: number) => formatMoney(fromPaisa(Math.round(n * 100)));

  return (
    <div className="space-y-4 pb-44">
      <PageHeader
        title={t('title')}
        description={t('subtitle', {
          vendor: `\u2068${vendor.data?.businessName ?? estimate.data?.vendor.businessName ?? ''}\u2069`,
        })}
      />

      <Steps steps={[t('stepAddress'), t('stepSchedule'), t('stepPayment')]} current={currentStep} />

      <Section step={1} title={t('addressTitle')} done={addressDone}>
        {addresses.isLoading ? (
          <Skeleton className="h-16 rounded-xl" />
        ) : addressMissing || showAddressForm ? (
          <AddressForm
            cityId={vendor.data?.cityId ?? 0}
            defaultLat={Number(vendor.data?.lat ?? 0)}
            defaultLng={Number(vendor.data?.lng ?? 0)}
            onCreated={(address) => {
              setAddressId(address.id);
              setShowAddressForm(false);
              void addresses.refetch();
            }}
            onCancel={addressMissing ? undefined : () => setShowAddressForm(false)}
          />
        ) : (
          <div className="space-y-2">
            {addresses.data?.map((address) => {
              const selected = address.id === effectiveAddressId;
              return (
                <button
                  key={address.id}
                  type="button"
                  onClick={() => setAddressId(address.id)}
                  aria-pressed={selected}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-xl border p-3 text-start transition-all duration-200 active:scale-[0.99]',
                    selected ? 'border-primary bg-primary/5 ring-primary/30 ring-2' : 'hover:bg-muted/60',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
                      selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <MapPin className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">
                      {address.label || address.area || address.line1}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {[address.line1, address.line2, address.area].filter(Boolean).join(', ')}
                    </span>
                  </span>
                  {selected ? <CheckCircle2 className="dh-tick text-primary mt-1 size-5 shrink-0" aria-hidden /> : null}
                </button>
              );
            })}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-primary"
              onClick={() => setShowAddressForm(true)}
            >
              <Plus aria-hidden />
              {t('addAddress')}
            </Button>
          </div>
        )}
      </Section>

      <Section step={2} title={t('pickupTitle')} done={!!pickupStart}>
        <DayChips
          days={pickupDays}
          value={effectivePickupDate}
          onChange={(value) => {
            setPickupDate(value);
            setPickupStart('');
            setDeliveryStart('');
            setDeliveryDate('');
          }}
          locale={locale}
          timeZone={timeZone}
        />
        {pickupSlots.isLoading ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-11 rounded-xl" />
            ))}
          </div>
        ) : pickupSlots.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{t('slotsError')}</AlertDescription>
          </Alert>
        ) : (
          <SlotPicker
            key={effectivePickupDate}
            slots={pickupSlots.data?.slots ?? []}
            value={pickupStart}
            onChange={(value) => {
              setPickupStart(value);
              setDeliveryStart('');
            }}
            locale={locale}
            timeZone={timeZone}
            emptyLabel={t('noSlots')}
          />
        )}
      </Section>

      <Section step={3} title={t('deliveryTitle')} done={!!deliveryStart}>
        {!pickupStart ? (
          <p className="text-muted-foreground bg-muted/50 rounded-xl p-3 text-sm">{t('pickupFirst')}</p>
        ) : (
          <>
            <DayChips
              days={deliveryDays}
              value={effectiveDeliveryDate}
              onChange={(value) => {
                setDeliveryDate(value);
                setDeliveryStart('');
              }}
              locale={locale}
              timeZone={timeZone}
            />
            {deliverySlots.isLoading ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 rounded-xl" />
                ))}
              </div>
            ) : deliverySlots.isError ? (
              <Alert variant="destructive">
                <AlertDescription>{t('slotsError')}</AlertDescription>
              </Alert>
            ) : (
              <SlotPicker
                key={effectiveDeliveryDate}
                slots={deliverySlots.data?.slots ?? []}
                value={deliveryStart}
                onChange={setDeliveryStart}
                locale={locale}
                timeZone={timeZone}
                emptyLabel={t('noSlots')}
              />
            )}
          </>
        )}
      </Section>

      <Section step={4} title={t('paymentTitle')} done={scheduleDone}>
        <div className="border-primary bg-primary/5 ring-primary/30 flex items-center gap-3 rounded-xl border p-3 ring-2">
          <span className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-full">
            <Banknote className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{t('cod')}</span>
            <span className="text-muted-foreground block text-xs">{t('codHint')}</span>
          </span>
          <CheckCircle2 className="text-primary size-5 shrink-0" aria-hidden />
        </div>
        <div className="text-muted-foreground bg-muted/40 flex items-center gap-2 rounded-xl p-3 text-xs">
          <Wallet className="size-4 shrink-0" aria-hidden />
          {t('onlineSoon')}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="checkout-note" className="text-sm font-medium">
            {t('noteTitle')}
          </label>
          <Textarea
            id="checkout-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t('notePlaceholder')}
            maxLength={300}
          />
        </div>
      </Section>

      <section className="bg-card space-y-3 rounded-2xl border p-4 text-sm shadow-xs">
        <h2 className="text-base font-semibold">{t('summaryTitle')}</h2>
        {cart.items.map((item) => {
          const line = estimate.data?.lines.find((entry) => entry.serviceItemId === item.itemId);
          return (
            <div key={item.itemId} className="flex justify-between gap-2">
              <span className="text-muted-foreground">
                {line ? (locale === 'ur' && line.nameUr ? line.nameUr : line.name) : item.itemId}{' '}
                <span className="tabular">× {item.quantity}</span>
              </span>
              <span className="tabular">{line ? formatMoney(line.lineTotal) : '—'}</span>
            </div>
          );
        })}
        <div className="space-y-2 border-t border-dashed pt-3">
          {estimate.data ? (
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
              <div className="flex justify-between border-t pt-2 text-base font-bold">
                <span>{t('total')}</span>
                <span className="tabular">{formatMoney(estimate.data.total)}</span>
              </div>
            </>
          ) : (
            <Skeleton className="h-5" />
          )}
        </div>
      </section>

      {placeOrder.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{placeOrder.error.message}</AlertDescription>
        </Alert>
      ) : null}

      <p className="text-muted-foreground text-center text-xs">{t('idempotencyHint')}</p>

      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/85 safe-bottom fixed inset-x-0 bottom-[4.25rem] z-20 border-t backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-xs">{t('total')}</p>
            <p className="text-xl leading-tight font-bold">
              {estimatedTotal ? <AnimatedNumber value={Number(estimatedTotal)} format={money} duration={500} /> : '—'}
            </p>
          </div>
          <Button
            size="lg"
            className="h-12 rounded-2xl px-6 text-base shadow-md"
            onClick={() => void place()}
            disabled={!canPlace}
          >
            {placeOrder.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {placeOrder.isPending ? t('placing') : t('placeOrder')}
          </Button>
        </div>
      </div>
    </div>
  );
}
