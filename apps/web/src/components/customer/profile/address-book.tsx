'use client';

import { useState } from 'react';
import { MapPin, Plus, Star, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { AddressForm } from '@/components/customer/address/address-form';
import { useAddresses, useDeleteAddress } from '@/lib/customer/hooks/use-addresses';

const LAHORE = { lat: 31.5204, lng: 74.3587 };

export function AddressBook() {
  const t = useTranslations('customer.profile');
  const addresses = useAddresses();
  const remove = useDeleteAddress();
  const [open, setOpen] = useState(false);

  const list = addresses.data ?? [];
  const seed = list.find((a) => a.isDefault) ?? list[0];

  return (
    <section id="addresses" className="bg-card scroll-mt-20 space-y-3 rounded-2xl border p-4 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{t('addressesTitle')}</h2>
        <Button size="sm" variant="outline" className="rounded-full" onClick={() => setOpen(true)}>
          <Plus className="size-4" aria-hidden />
          {t('addAddress')}
        </Button>
      </div>

      {addresses.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : list.length === 0 ? (
        <EmptyState icon={<MapPin aria-hidden />} title={t('addressesEmpty')} className="py-8" />
      ) : (
        <ul className="stagger space-y-2">
          {list.map((address) => (
            <li key={address.id} className="flex items-start gap-3 rounded-xl border p-3">
              <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full">
                <MapPin className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {address.label || address.area || address.line1}
                  {address.isDefault ? (
                    <span className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
                      <Star className="size-3 fill-current" aria-hidden />
                      {t('defaultBadge')}
                    </span>
                  ) : null}
                </p>
                <p className="text-muted-foreground text-xs">
                  {[address.line1, address.line2, address.area].filter(Boolean).join(', ')}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive size-8"
                aria-label={t('removeAddress')}
                disabled={remove.isPending}
                onClick={() => {
                  void remove
                    .mutateAsync(address.id)
                    .then(() => toast.success(t('addressRemoved')))
                    .catch(() => toast.error(t('addressRemoveError')));
                }}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('addAddress')}</DialogTitle>
            <DialogDescription>{t('addAddressHint')}</DialogDescription>
          </DialogHeader>
          <AddressForm
            cityId={seed?.cityId ?? 1}
            defaultLat={seed ? Number(seed.lat) : LAHORE.lat}
            defaultLng={seed ? Number(seed.lng) : LAHORE.lng}
            onCreated={() => {
              setOpen(false);
              toast.success(t('addressAdded'));
            }}
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </section>
  );
}
