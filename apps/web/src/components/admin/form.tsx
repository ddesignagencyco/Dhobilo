'use client';

import type { ReactNode } from 'react';
import type { FieldError, FieldErrors } from 'react-hook-form';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * A labelled field with its error. Deliberately small: react-hook-form already does the work, and a full
 * context-based form abstraction would hide which input is bound to which name, which is the one thing
 * worth being able to read at a glance.
 */
export function Field({
  name,
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  name: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: FieldError | { message?: string };
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const message = error?.message;
  const describedBy = [hint ? `${name}-hint` : null, message ? `${name}-error` : null].filter(Boolean).join(' ');

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={name}>
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden>
            *
          </span>
        ) : null}
      </Label>

      {/* aria-describedby is wired here so every input gets it without each form remembering to. */}
      <div aria-describedby={describedBy || undefined}>{children}</div>

      {hint && !message ? (
        <p id={`${name}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
      {message ? (
        <p id={`${name}-error`} className="text-destructive text-xs">
          {message}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Attaches a failed request's field errors to the form.
 *
 * The API answers VALIDATION_FAILED with `details: [{ field, messages }]`. Mapping those onto the inputs
 * means a server-side rule the browser schema does not know about still lands next to the right box
 * instead of in a toast. Anything whose field has no matching input is returned so the caller can show it
 * at form level rather than dropping it.
 */
export function applyServerFieldErrors(
  fieldErrors: { field: string; messages: string[] }[],
  knownFields: readonly string[],
  setError: (name: never, error: { type: string; message: string }) => void,
): string[] {
  const unmatched: string[] = [];
  for (const { field, messages } of fieldErrors) {
    const message = messages.join(', ');
    if (field && (knownFields as readonly string[]).includes(field)) {
      setError(field as never, { type: 'server', message });
    } else {
      unmatched.push(field ? `${field}: ${message}` : message);
    }
  }
  return unmatched;
}

export type { FieldErrors };
