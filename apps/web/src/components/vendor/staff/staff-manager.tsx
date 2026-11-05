'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
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
    <div className="space-y-6">
      <form onSubmit={onAdd} className="bg-card space-y-4 rounded-xl border p-4" noValidate>
        <h2 className="font-semibold">{t('addTitle')}</h2>
        <p className="text-muted-foreground text-sm">{t('addHint')}</p>
        {formError ? (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
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
        </div>
        <Button type="submit" disabled={add.isPending}>
          {add.isPending ? t('adding') : t('add')}
        </Button>
      </form>

      <div className="bg-card rounded-xl border">
        <h2 className="border-b p-4 font-semibold">{t('listTitle')}</h2>
        {staff.isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : staff.isError ? (
          <p className="text-destructive p-4 text-sm">{t('loadFailed')}</p>
        ) : staff.data && staff.data.length > 0 ? (
          <ul className="divide-y">
            {staff.data.map((member) => (
              <li key={member.userId} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{member.name || t('unnamed')}</p>
                  <p className="text-muted-foreground text-sm" dir="ltr">
                    {member.phone}
                  </p>
                </div>
                <Badge variant={member.hasSignedIn ? 'success' : 'muted'}>
                  {member.hasSignedIn ? t('active') : t('invited')}
                </Badge>
                <Button variant="ghost" size="icon" aria-label={t('remove')} onClick={() => setToRemove(member)}>
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground p-4 text-sm">{t('empty')}</p>
        )}
      </div>

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
