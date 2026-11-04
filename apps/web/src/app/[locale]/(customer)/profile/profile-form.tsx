'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type ProfileState, updateCustomerProfile } from '@/lib/customer/actions';

function SubmitButton() {
  const t = useTranslations('customer.profile');
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="animate-spin" />
          {t('saving')}
        </>
      ) : (
        t('save')
      )}
    </Button>
  );
}

export function ProfileForm({ locale, name }: { locale: string; name: string | null }) {
  const t = useTranslations('customer.profile');
  const [state, action] = useActionState<ProfileState, FormData>(
    updateCustomerProfile.bind(null, locale),
    {},
  );

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.ok ? (
        <Alert variant="success">
          <CheckCircle2 />
          <AlertDescription>{t('saved')}</AlertDescription>
        </Alert>
      ) : null}

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>
            <p>{state.error.message}</p>
            {state.error.requestId ? (
              <p className="text-muted-foreground font-mono text-[11px]">{state.error.requestId}</p>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="name">{t('name')}</Label>
        <Input
          id="name"
          name="name"
          defaultValue={name ?? ''}
          placeholder={t('namePlaceholder')}
          autoComplete="name"
          maxLength={80}
        />
      </div>

      <SubmitButton />
    </form>
  );
}
