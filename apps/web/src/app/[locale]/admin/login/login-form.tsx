'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type LoginState, signIn } from '@/lib/auth/actions';

function SubmitButton() {
  const t = useTranslations('login');
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="animate-spin" />
          {t('submitting')}
        </>
      ) : (
        t('submit')
      )}
    </Button>
  );
}

export function LoginForm({
  locale,
  next,
  banner,
}: {
  locale: string;
  next?: string;
  banner?: string;
}) {
  const t = useTranslations();
  const [state, formAction] = useActionState<LoginState, FormData>(signIn.bind(null, locale, next), {});

  // The API answers ACCOUNT_LOCKED after 5 failures; its own message says so, but staff need the
  // 15-minute figure spelled out or they keep trying.
  const message =
    state.error?.code === 'ACCOUNT_LOCKED'
      ? t('login.locked')
      : state.error?.code === 'INVALID_CREDENTIALS'
        ? t('login.invalid')
        : state.error?.message;

  return (
    <Card>
      <CardContent className="pt-0">
        {banner && !message ? (
          <Alert variant="warning" className="mb-4">
            <AlertCircle />
            <AlertDescription>{banner}</AlertDescription>
          </Alert>
        ) : null}

        {message ? (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle />
            <AlertDescription>
              <p>{message}</p>
              {state.error?.requestId ? (
                <p className="text-muted-foreground font-mono text-[11px]">{state.error.requestId}</p>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        <form action={formAction} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">{t('login.email')}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              inputMode="email"
              dir="ltr"
              placeholder={t('login.emailPlaceholder')}
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{t('login.password')}</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" dir="ltr" required />
          </div>

          <SubmitButton />
        </form>
      </CardContent>
    </Card>
  );
}
