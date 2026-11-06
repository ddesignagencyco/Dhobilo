'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type LoginState, signIn } from '@/lib/auth/actions';

function SubmitButton() {
  const t = useTranslations('login');
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={pending}>
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

export function LoginForm({ locale, next, banner }: { locale: string; next?: string; banner?: string }) {
  const t = useTranslations();
  const [showPassword, setShowPassword] = useState(false);
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
    <div>
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
            key={state.email ?? ''}
            defaultValue={state.email}
            type="email"
            autoComplete="username"
            inputMode="email"
            dir="ltr"
            placeholder={t('login.emailPlaceholder')}
            className="h-12 text-base"
            required
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">{t('login.password')}</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              dir="ltr"
              className="h-12 pe-12 text-base"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? t('login.hide') : t('login.show')}
              aria-pressed={showPassword}
              className="text-muted-foreground hover:text-foreground absolute inset-y-0 end-0 flex w-12 items-center justify-center"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        <SubmitButton />
      </form>
    </div>
  );
}
