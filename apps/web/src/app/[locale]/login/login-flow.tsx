'use client';

import { useActionState, useCallback, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type OtpState, requestOtp, verifyOtp } from '@/lib/customer/actions';

const CODE_LENGTH = 6;

function SubmitButton({ label, pendingLabel, id }: { label: string; pendingLabel: string; id?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button id={id} type="submit" size="lg" className="w-full" disabled={pending}>
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
 * paste to fill, and submit automatically once the sixth digit lands. A hidden input carries the
 * joined value into the form so the server action sees an ordinary `code` field.
 */
function CodeInput({ label, onComplete }: { label: string; onComplete: () => void }) {
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const filled = digits.every((digit) => digit !== '');

  useEffect(() => {
    if (filled) onComplete();
  }, [filled, onComplete]);

  function setDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < CODE_LENGTH - 1) inputs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (!pasted) return;
    event.preventDefault();
    const next = Array(CODE_LENGTH).fill('');
    for (let index = 0; index < pasted.length; index += 1) next[index] = pasted[index] ?? '';
    setDigits(next);
    inputs.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
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
          onChange={(event) => setDigit(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
          onFocus={(event) => event.target.select()}
          inputMode="numeric"
          pattern="\d*"
          maxLength={1}
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          aria-label={`${label} ${index + 1}`}
          className="h-12 w-12 px-0 text-center text-lg font-semibold"
        />
      ))}
    </div>
  );
}

export function LoginFlow({
  locale,
  next,
  banner,
  devHint,
  asVendor = false,
}: {
  locale: string;
  next?: string;
  asVendor?: boolean;
  banner?: string;
  devHint?: string;
}) {
  const t = useTranslations('customer.login');
  const tVendor = useTranslations('vendor.shell');
  const router = useRouter();
  const [requestState, requestAction, requestPending] = useActionState<OtpState, FormData>(
    requestOtp.bind(null, locale),
    {},
  );
  const [verifyState, verifyAction] = useActionState<OtpState, FormData>(verifyOtp.bind(null, locale, next), {});

  const submitCode = useCallback(() => {
    document.getElementById('customer-otp-submit')?.click();
  }, []);

  const [secondsLeft, setSecondsLeft] = useState(0);
  useEffect(() => {
    const seconds = requestState.expiresInSeconds;
    if (!seconds) return;
    // Deferred so this effect only syncs the external timer, not a cascading render.
    const timer = setTimeout(() => setSecondsLeft(seconds), 0);
    return () => clearTimeout(timer);
  }, [requestState]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const codeStep = requestState.step === 'code' && Boolean(requestState.phone);
  const error = verifyState.error ?? requestState.error;
  const errorMessage =
    error?.code === 'NOT_CUSTOMER'
      ? t('notCustomer')
      : error?.code === 'INVALID_OTP'
        ? t('invalidCode')
        : error?.code === 'VALIDATION_FAILED'
          ? codeStep
            ? t('invalidCode')
            : t('invalidPhone')
          : error?.code === 'RATE_LIMITED'
            ? t('rateLimited')
            : error?.code === 'API_UNREACHABLE'
              ? t('unreachable')
              : error?.message;

  return (
    <div className="bg-card rounded-xl border p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <ShieldCheck className="text-primary size-5" aria-hidden />
        <h2 className="font-semibold">{codeStep ? t('codeTitle') : t('phoneTitle')}</h2>
      </div>

      {banner ? (
        <Alert variant="info" className="mb-4">
          <AlertDescription>{banner}</AlertDescription>
        </Alert>
      ) : null}

      {errorMessage ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            <p>{errorMessage}</p>
            {error?.requestId ? <p className="text-muted-foreground font-mono text-[11px]">{error.requestId}</p> : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {codeStep ? (
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">
            {t('codeSentTo')}{' '}
            <span dir="ltr" className="text-foreground font-mono">
              {requestState.phone}
            </span>
          </p>

          <form action={verifyAction} className="space-y-4" noValidate>
            <input type="hidden" name="phone" value={requestState.phone} />
            {asVendor ? <input type="hidden" name="role" value="VENDOR_OWNER" /> : null}
            <CodeInput label={t('codeDigit')} onComplete={submitCode} />
            <SubmitButton id="customer-otp-submit" label={t('verify')} pendingLabel={t('verifying')} />
          </form>

          <div className="flex items-center justify-between gap-2">
            <form action={requestAction}>
              <input type="hidden" name="phone" value={requestState.phone} />
              <Button type="submit" variant="ghost" size="sm" disabled={requestPending || secondsLeft > 0}>
                {secondsLeft > 0 ? t('resendIn', { seconds: secondsLeft }) : t('resend')}
              </Button>
            </form>
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => router.replace(asVendor ? '/login?as=vendor' : '/login')}
            >
              {t('changeNumber')}
            </Button>
          </div>
        </div>
      ) : (
        <form action={requestAction} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="phone">{t('phone')}</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              placeholder={t('phonePlaceholder')}
              className="h-11"
              autoFocus
              required
            />
          </div>
          <SubmitButton label={t('sendCode')} pendingLabel={t('sending')} />
        </form>
      )}

      <p className="mt-4 text-center text-sm">
        <Link
          href={asVendor ? '/login' : '/login?as=vendor'}
          className="text-primary underline-offset-4 hover:underline"
        >
          {asVendor ? tVendor('loginAsCustomer') : tVendor('loginAsVendor')}
        </Link>
      </p>

      {devHint ? <p className="text-muted-foreground mt-4 text-center text-xs">{devHint}</p> : null}
    </div>
  );
}
