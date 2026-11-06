'use client';

import { useActionState, useCallback, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type OtpRole, type OtpState, requestOtp, verifyOtp } from '@/lib/auth/otp-actions';
import { LOGIN_PATH } from './auth-shell';

const CODE_LENGTH = 6;

function SubmitButton({ label, pendingLabel, id }: { label: string; pendingLabel: string; id?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button id={id} type="submit" size="lg" className="h-12 w-full text-base" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="animate-spin" />
          {pendingLabel}
        </>
      ) : (
        label
      )}
    </Button>
  );
}

/**
 * Six one-character boxes that behave like a single field: type to advance, backspace to retreat,
 * paste or SMS autofill to fill, and submit automatically once the sixth digit lands. A hidden input
 * carries the joined value so the server action sees an ordinary `code` field.
 */
function CodeInput({ label, onComplete }: { label: string; onComplete: () => void }) {
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const filled = digits.every((digit) => digit !== '');

  useEffect(() => {
    if (filled) onComplete();
  }, [filled, onComplete]);

  function fill(value: string, from: number) {
    const chars = value
      .replace(/\D/g, '')
      .slice(0, CODE_LENGTH - from)
      .split('');
    if (chars.length === 0) return false;
    setDigits((prev) => {
      const next = [...prev];
      chars.forEach((c, i) => (next[from + i] = c));
      return next;
    });
    inputs.current[Math.min(from + chars.length, CODE_LENGTH - 1)]?.focus();
    return true;
  }

  function handleChange(index: number, value: string) {
    if (value === '') {
      setDigits((prev) => prev.map((d, i) => (i === index ? '' : d)));
      return;
    }
    // Autofill delivers the whole code into one box; typing delivers one character.
    fill(value.length > 1 ? value : value.slice(-1), value.length > 1 ? 0 : index);
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) inputs.current[index - 1]?.focus();
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    if (fill(event.clipboardData.getData('text'), 0)) event.preventDefault();
  }

  return (
    <div className="flex justify-between gap-2" dir="ltr">
      <input type="hidden" name="code" value={digits.join('')} />
      {digits.map((digit, index) => (
        <Input
          key={index}
          ref={(element) => {
            inputs.current[index] = element;
          }}
          value={digit}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
          onFocus={(event) => event.target.select()}
          inputMode="numeric"
          pattern="\d*"
          maxLength={index === 0 ? CODE_LENGTH : 1}
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          aria-label={`${label} ${index + 1}`}
          className="h-12 min-w-0 flex-1 px-0 text-center text-lg font-semibold sm:h-13"
        />
      ))}
    </div>
  );
}

type Props = { role: OtpRole; locale: string; next?: string; banner?: string; devHint?: boolean };

/** Remounting on "Change number" is the simplest reliable way to drop the action state. */
export function OtpSignIn(props: Props) {
  const [resetKey, setResetKey] = useState(0);
  return <OtpSignInForm key={resetKey} {...props} onChangeNumber={() => setResetKey((k) => k + 1)} />;
}

function OtpSignInForm({
  role,
  locale,
  next,
  banner,
  devHint,
  onChangeNumber,
}: Props & { onChangeNumber: () => void }) {
  const t = useTranslations('auth');
  // One state for both steps: a stale verify error can never outlive the next request.
  const [state, formAction, pending] = useActionState<OtpState, FormData>(
    async (prev, formData) =>
      formData.get('intent') === 'verify'
        ? verifyOtp(role, locale, next, prev, formData)
        : requestOtp(locale, prev, formData),
    {},
  );

  const submitCode = useCallback(() => {
    document.getElementById('otp-submit')?.click();
  }, []);

  const phone = state.phone;
  const codeStep = state.step === 'code' && Boolean(phone);

  const [secondsLeft, setSecondsLeft] = useState(0);
  useEffect(() => {
    const seconds = state.step === 'code' ? state.expiresInSeconds : undefined;
    if (!seconds) return;
    const timer = setTimeout(() => setSecondsLeft(seconds), 0);
    return () => clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const error = state.error;
  const wrongArea = error?.code === 'WRONG_ROLE' ? state.actualArea : undefined;
  const errorMessage = wrongArea
    ? t('form.wrongRole', { area: t(`area.${wrongArea}`) })
    : error?.code === 'INVALID_OTP'
      ? t('form.invalidCode')
      : error?.code === 'VALIDATION_FAILED'
        ? codeStep
          ? t('form.invalidCode')
          : t('form.invalidPhone')
        : error?.code === 'RATE_LIMITED'
          ? t('form.rateLimited')
          : error?.code === 'API_UNREACHABLE'
            ? t('form.unreachable')
            : error?.message;

  return (
    <div className="space-y-6">
      {banner ? (
        <Alert variant="info">
          <AlertDescription>{banner}</AlertDescription>
        </Alert>
      ) : null}

      {errorMessage ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            <p>{errorMessage}</p>
            {wrongArea && wrongArea !== 'admin' ? (
              <p className="mt-1">
                <Link href={LOGIN_PATH[wrongArea]} className="font-medium underline underline-offset-4">
                  {t('form.wrongRoleLink', { area: t(`area.${wrongArea}`) })}
                </Link>
              </p>
            ) : null}
            {error?.requestId ? <p className="text-muted-foreground font-mono text-[11px]">{error.requestId}</p> : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {codeStep ? (
        <div className="space-y-5" aria-live="polite">
          <p className="text-muted-foreground text-sm">
            {t('form.codeSentTo')}{' '}
            <span dir="ltr" className="text-foreground tabular font-medium">
              {phone}
            </span>
          </p>

          <form action={formAction} className="space-y-5" noValidate>
            <input type="hidden" name="intent" value="verify" />
            <input type="hidden" name="phone" value={phone} />
            <CodeInput label={t('form.codeDigit')} onComplete={submitCode} />
            <SubmitButton id="otp-submit" label={t('form.verify')} pendingLabel={t('form.verifying')} />
          </form>

          <div className="flex items-center justify-between gap-2">
            <form action={formAction}>
              <input type="hidden" name="intent" value="request" />
              <input type="hidden" name="phone" value={phone} />
              <Button type="submit" variant="ghost" size="sm" disabled={pending || secondsLeft > 0}>
                {secondsLeft > 0 ? t('form.resendIn', { seconds: secondsLeft }) : t('form.resend')}
              </Button>
            </form>
            <Button type="button" variant="link" size="sm" onClick={onChangeNumber}>
              {t('form.changeNumber')}
            </Button>
          </div>
        </div>
      ) : (
        <form action={formAction} className="space-y-4" noValidate>
          <input type="hidden" name="intent" value="request" />
          <div className="space-y-2">
            <Label htmlFor="phone">{t('form.phone')}</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              placeholder={t('form.phonePlaceholder')}
              className="h-12 text-base"
              defaultValue={state.phone}
              autoFocus
              required
            />
            <p className="text-muted-foreground text-xs">{t('form.phoneHint')}</p>
          </div>
          <SubmitButton label={t('form.sendCode')} pendingLabel={t('form.sending')} />
        </form>
      )}

      {devHint ? <p className="text-muted-foreground text-center text-xs">{t('form.devHint')}</p> : null}
    </div>
  );
}
