'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { AdminRole, type CreateAdminForm, type CreateAdminInput, createAdminSchema } from '@dhoblio/shared';
import { Field, applyServerFieldErrors } from '@/components/admin/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BffError } from '@/lib/api/bff';
import { useAdminMutation } from '@/lib/hooks/use-admin-mutation';

const FIELDS = ['email', 'name', 'password', 'adminRole'] as const;
const ROLES = [AdminRole.OPERATIONS, AdminRole.FINANCE, AdminRole.SUPPORT, AdminRole.SUPER_ADMIN] as const;

export function CreateAdminDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<CreateAdminForm, unknown, CreateAdminInput>({
    resolver: zodResolver(createAdminSchema),
    defaultValues: { adminRole: AdminRole.OPERATIONS },
  });

  const create = useAdminMutation<unknown, CreateAdminInput>({
    request: (input) => ({ path: '/admin/admins', options: { body: input } }),
    successMessage: t('admins.created'),
    invalidate: [['admin', 'admins']],
    onSuccess: onClose,
  });

  async function onSubmit(values: CreateAdminInput) {
    setFormError(null);
    try {
      await create.mutateAsync(values);
    } catch (error) {
      if (error instanceof BffError && error.fieldErrors.length) {
        const unmatched = applyServerFieldErrors(error.fieldErrors, FIELDS, form.setError);
        if (unmatched.length) setFormError(unmatched.join(' · '));
      }
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('admins.addTitle')}</DialogTitle>
          <DialogDescription>{t('admins.addBody')}</DialogDescription>
        </DialogHeader>

        {formError ? (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field name="name" label={t('common.name')} error={form.formState.errors.name} required>
            <Input id="name" autoComplete="off" {...form.register('name')} />
          </Field>

          <Field name="email" label={t('common.email')} error={form.formState.errors.email} required>
            <Input id="email" type="email" dir="ltr" autoComplete="off" {...form.register('email')} />
          </Field>

          <Field
            name="password"
            label={t('admins.initialPassword')}
            error={form.formState.errors.password}
            hint={t('admins.passwordHint')}
            required
          >
            {/* new-password, so a browser does not autofill the creating admin's own credentials here. */}
            <Input id="password" type="password" dir="ltr" autoComplete="new-password" {...form.register('password')} />
          </Field>

          <Field name="adminRole" label={t('admins.role')} error={form.formState.errors.adminRole} required>
            <Select
              value={form.watch('adminRole')}
              onValueChange={(v) => form.setValue('adminRole', v as CreateAdminForm['adminRole'])}
            >
              <SelectTrigger id="adminRole" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {t(`roles.${role}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={create.isPending}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? <Loader2 className="animate-spin" /> : null}
              {t('admins.add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
