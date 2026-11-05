'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, MapPin, Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { formatMoney } from '@dhoblio/shared';
import { Link, useRouter } from '@/i18n/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
    return <p className="text-muted-foreground text-sm">{emptyLabel}</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {slots.map((slot) => {
        const selected = slot.start === value;
        return (
          <Button
            key={slot.start}
            type="button"
            variant={selected ? 'default' : 'outline'}
            className="justify-center"
            disabled={!slot.available}
            onClick={() => onChange(slot.start)}
          >
            {formatSlotRange(slot.start, slot.end, locale, timeZone)}
          </Button>
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
  const effectiveDeliveryDate = deliveryDate || effectivePickupDate;
  const pickupDays = useMemo(() => Array.from({ length: 8 }, (_, index) => addDays(today, index)), [today]);
  const deliveryDays = useMemo(
    () => Array.from({ length: 8 }, (_, index) => addDays(effectivePickupDate, index)),
    [effectivePickupDate],
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
      <div className="space-y-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <Card>
          <CardContent className="space-y-3 p-6 text-center">
            <p className="font-medium">{t('empty')}</p>
            <Button asChild variant="outline">
              <Link href="/discovery">{t('browse')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const addressMissing = !addresses.isLoading && (!addresses.data || addresses.data.length === 0);

  return (
    <div className="space-y-4 pb-40">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('subtitle', { vendor: vendor.data?.businessName ?? estimate.data?.vendor.businessName ?? '' })}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="size-4" aria-hidden />
            {t('addressTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {addresses.isLoading ? (
            <Skeleton className="h-16" />
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
                    className={`w-full rounded-lg border p-3 text-start transition ${
                      selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{address.label || address.area || address.line1}</p>
                        <p className="text-muted-foreground text-xs">
                          {[address.line1, address.line2, address.area].filter(Boolean).join(', ')}
                        </p>
                      </div>
                      {selected ? <CheckCircle2 className="text-primary size-4" aria-hidden /> : null}
                    </div>
                  </button>
                );
              })}
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddressForm(true)}>
                <Plus className="mr-2 size-4" aria-hidden />
                {t('addAddress')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('pickupTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t('date')}</Label>
            <Select
              value={effectivePickupDate}
              onValueChange={(value) => {
                setPickupDate(value);
                setPickupStart('');
                setDeliveryStart('');
                setDeliveryDate('');
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('chooseDate')} />
              </SelectTrigger>
              <SelectContent>
                {pickupDays.map((day) => (
                  <SelectItem key={day} value={day}>
                    {formatDayLabel(day, locale, timeZone)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {pickupSlots.isLoading ? (
            <Skeleton className="h-10" />
          ) : pickupSlots.isError ? (
            <Alert variant="destructive">
              <AlertDescription>{t('slotsError')}</AlertDescription>
            </Alert>
          ) : (
            <SlotPicker
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('deliveryTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!pickupStart ? (
            <p className="text-muted-foreground text-sm">{t('pickupFirst')}</p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>{t('date')}</Label>
                <Select
                  value={effectiveDeliveryDate}
                  onValueChange={(value) => {
                    setDeliveryDate(value);
                    setDeliveryStart('');
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('chooseDate')} />
                  </SelectTrigger>
                  <SelectContent>
                    {deliveryDays.map((day) => (
                      <SelectItem key={day} value={day}>
                        {formatDayLabel(day, locale, timeZone)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {deliverySlots.isLoading ? (
                <Skeleton className="h-10" />
              ) : deliverySlots.isError ? (
                <Alert variant="destructive">
                  <AlertDescription>{t('slotsError')}</AlertDescription>
                </Alert>
              ) : (
                <SlotPicker
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('paymentTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="border-primary bg-primary/5 flex items-center gap-2 rounded-lg border p-3 text-sm">
            <CheckCircle2 className="text-primary size-4" aria-hidden />
            <span className="font-medium">{t('cod')}</span>
            <span className="text-muted-foreground ms-auto text-xs">{t('codHint')}</span>
          </div>
          <p className="text-muted-foreground text-xs">{t('onlineSoon')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('noteTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Label htmlFor="checkout-note" className="sr-only">
            {t('noteTitle')}
          </Label>
          <Textarea
            id="checkout-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t('notePlaceholder')}
            maxLength={300}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('summaryTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {cart.items.map((item) => {
            const line = estimate.data?.lines.find((entry) => entry.serviceItemId === item.itemId);
            return (
              <div key={item.itemId} className="flex justify-between gap-2">
                <span className="text-muted-foreground">
                  {line ? (locale === 'ur' && line.nameUr ? line.nameUr : line.name) : item.itemId} × {item.quantity}
                </span>
                <span>{line ? formatMoney(line.lineTotal) : '—'}</span>
              </div>
            );
          })}
          <Separator />
          {estimate.data ? (
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
              <div className="flex justify-between text-base font-semibold">
                <span>{t('total')}</span>
                <span>{formatMoney(estimate.data.total)}</span>
              </div>
            </>
          ) : (
            <Skeleton className="h-5" />
          )}
        </CardContent>
      </Card>

      {placeOrder.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{placeOrder.error.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed inset-x-0 bottom-14 z-20 border-t backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-xs">{t('total')}</p>
            <p className="text-lg font-bold">{estimatedTotal ? formatMoney(estimatedTotal) : '—'}</p>
          </div>
          <Button onClick={() => void place()} disabled={!canPlace}>
            {placeOrder.isPending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
            {t('placeOrder')}
          </Button>
        </div>
      </div>

      <p className="text-muted-foreground text-center text-xs">{t('idempotencyHint')}</p>
    </div>
  );
}
