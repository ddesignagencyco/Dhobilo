'use client';

import { useState } from 'react';
import { Trash2, UserPlusIcon, UsersIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ShopAvatar } from '../shop-avatar';
import { type StaffMember, useAddStaff, useRemoveStaff, useVendorStaff } from '@/lib/vendor/hooks/use-vendor-staff';

export function StaffManager() {
  const t = useTranslations('vendor.staff');
  const staff = useVendorStaff();
  const add = useAddStaff();
  const remove = useRemoveStaff();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<StaffMember | null>(null);

  const forbidden = staff.error && (staff.error as { status?: number }).status === 403;

  async function onAdd(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (phone.trim().length < 10) {
      setFormError(t('invalidPhone'));
      return;
    }
    try {
      await add.mutateAsync({
        phone: phone.trim(),
        name: name.trim() || undefined,
      });
      setPhone('');
      setName('');
      toast.success(t('added'));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t('addFailed'));
    }
  }

  async function onRemove() {
    if (!toRemove) return;
    try {
      await remove.mutateAsync(toRemove.userId);
      toast.success(t('removed'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('removeFailed'));
    } finally {
      setToRemove(null);
    }
  }

  if (forbidden) {
    return (
      <Alert variant="warning">
        <AlertDescription>{t('ownerOnly')}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-5">
      <div className="bg-card overflow-hidden rounded-xl border shadow-xs lg:col-span-3">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-semibold">{t('listTitle')}</h2>
          {staff.data ? (
            <span className="bg-muted text-muted-foreground tabular rounded-full px-2 py-0.5 text-xs font-semibold">
              {staff.data.length}
            </span>
          ) : null}
        </div>
        {staff.isLoading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-14 rounded-lg" />
            <Skeleton className="h-14 rounded-lg" />
          </div>
        ) : staff.isError ? (
          <p className="text-destructive p-5 text-sm">{t('loadFailed')}</p>
        ) : staff.data && staff.data.length > 0 ? (
          <ul className="stagger divide-y">
            {staff.data.map((member) => (
              <li
                key={member.userId}
                className="hover:bg-muted/40 flex items-center gap-3 px-5 py-3.5 transition-colors"
              >
                <ShopAvatar name={member.name || member.phone} rounded="rounded-full" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{member.name || t('unnamed')}</p>
                  <p className="text-muted-foreground tabular text-sm" dir="ltr">
                    {member.phone}
                  </p>
                </div>
                <Badge variant={member.hasSignedIn ? 'success' : 'muted'}>
                  {member.hasSignedIn ? t('active') : t('invited')}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hover:text-destructive"
                  aria-label={t('remove')}
                  onClick={() => setToRemove(member)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<UsersIcon aria-hidden />} title={t('empty')} className="m-5 border-transparent" />
        )}
      </div>

      <form
        onSubmit={onAdd}
        className="bg-card space-y-4 rounded-xl border p-5 shadow-xs lg:sticky lg:top-20 lg:col-span-2"
        noValidate
      >
        <div className="flex items-center gap-3">
          <span className="bg-accent text-accent-foreground flex size-9 items-center justify-center rounded-lg">
            <UserPlusIcon className="size-4" aria-hidden />
          </span>
          <div>
            <h2 className="font-semibold">{t('addTitle')}</h2>
            <p className="text-muted-foreground text-xs">{t('addHint')}</p>
          </div>
        </div>
        {formError ? (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="staff-phone">{t('phone')}</Label>
          <Input
            id="staff-phone"
            type="tel"
            inputMode="tel"
            dir="ltr"
            placeholder="03001234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="staff-name">{t('name')}</Label>
          <Input id="staff-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </div>
        <Button type="submit" className="w-full" disabled={add.isPending}>
          {add.isPending ? t('adding') : t('add')}
        </Button>
      </form>

      <Dialog open={toRemove !== null} onOpenChange={(open) => !open && setToRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('removeTitle')}</DialogTitle>
            <DialogDescription>
              {t('removeBody', {
                name: toRemove?.name || toRemove?.phone || '',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToRemove(null)}>
              {t('cancel')}
            </Button>
            <Button variant="destructive" onClick={onRemove} disabled={remove.isPending}>
              {t('confirmRemove')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
