/**
 * Error handling contract with the API.
 *
 * The API answers every failure with `{ error: { code, message, details?, requestId } }`
 * (apps/api/src/common/filters/all-exceptions.filter.ts) and there are well over a hundred domain codes,
 * each already carrying a readable English message written by the backend.
 *
 * So the panel does NOT keep a message per code — that table would be stale within a week. It shows the
 * server's own message and keeps only the codes where the UI has to *behave* differently.
 */

/** The envelope the API sends on failure. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

/** Retrying the identical request is safe and likely to work. The client backs off and retries these. */
export const RETRYABLE_ERROR_CODES: readonly string[] = ['SERVICE_BUSY', 'RATE_LIMITED'];

/** The session is gone or untrusted: stop retrying, clear it and send the admin to the login screen. */
export const SESSION_ERROR_CODES: readonly string[] = ['UNAUTHENTICATED', 'CSRF_ORIGIN'];

/**
 * The admin's own account is no longer usable, so re-login will not help either. Phase 9b deactivates an
 * admin by revoking their sessions, and the guard reloads adminRole on every request.
 */
export const ACCOUNT_ERROR_CODES: readonly string[] = ['ACCOUNT_SUSPENDED', 'ACCOUNT_LOCKED'];

/**
 * The few places where the server's message is aimed at an end customer, or is too terse for staff who
 * need to know what to do next. Everything else falls through to the server's message.
 */
export const ADMIN_MESSAGE_OVERRIDES: Record<string, string> = {
  SERVICE_BUSY: 'The system is busy. This will retry automatically — nothing was saved twice.',
  RATE_LIMITED: 'Too many requests. Wait a moment and try again.',
  UNAUTHENTICATED: 'Your session expired. Please sign in again.',
  CSRF_ORIGIN: 'That request did not come from the admin panel. Please sign in again.',
  INTERNAL_ERROR: 'Something broke on our side. The request ID below will let us trace it.',
  VALIDATION_FAILED: 'Some fields need fixing.',
  // Money and state races: staff need to know their view was stale, not that they did something wrong.
  ORDER_STATE_CHANGED: 'This order changed while you were looking at it. Reload to see its current state.',
  AUDIENCE_CHANGED: 'The audience changed since the preview. Preview again before sending.',
  PROMO_CHANGED: 'This promo changed while you were editing it. Reload and reapply your change.',
  PAYOUT_INVALID_STATE: 'This payout is no longer in a state where that action applies. Reload the queue.',
  LAST_SUPER_ADMIN: 'You cannot remove the last active super admin. Promote another admin first.',
  CANNOT_CHANGE_SELF: 'You cannot change your own role or status.',
};

export function isRetryableErrorCode(code: string | undefined): boolean {
  return !!code && RETRYABLE_ERROR_CODES.includes(code);
}

export function isSessionErrorCode(code: string | undefined): boolean {
  return !!code && SESSION_ERROR_CODES.includes(code);
}

export function isAccountErrorCode(code: string | undefined): boolean {
  return !!code && ACCOUNT_ERROR_CODES.includes(code);
}

/** What to show the admin: our wording where we have a reason to override, else the server's. */
export function adminErrorMessage(code: string | undefined, serverMessage: string | undefined): string {
  if (code && ADMIN_MESSAGE_OVERRIDES[code]) return ADMIN_MESSAGE_OVERRIDES[code];
  return serverMessage?.trim() || 'Something went wrong.';
}

/**
 * Field errors out of a VALIDATION_FAILED body, so react-hook-form can attach them to the right input
 * instead of dumping one long string in a toast.
 *
 * The API's shape is `details: [{ field, messages: [...] }]` (see the 400 example on any route in
 * openapi.json). Older/hand-thrown cases send a bare string or an array of strings, so both are tolerated
 * and returned under an empty field name, which the form layer shows at form level.
 */
export interface FieldError {
  field: string;
  messages: string[];
}

export function validationDetails(details: unknown): FieldError[] {
  if (typeof details === 'string') return [{ field: '', messages: [details] }];
  if (!Array.isArray(details)) return [];

  const out: FieldError[] = [];
  for (const entry of details) {
    if (typeof entry === 'string') {
      out.push({ field: '', messages: [entry] });
      continue;
    }
    if (entry && typeof entry === 'object' && 'field' in entry) {
      const e = entry as { field: unknown; messages?: unknown };
      const messages = Array.isArray(e.messages)
        ? e.messages.filter((m): m is string => typeof m === 'string')
        : [];
      if (typeof e.field === 'string' && messages.length) out.push({ field: e.field, messages });
    }
  }
  return out;
}

/** Flattens field errors into one readable line, for a toast or a summary above the form. */
export function validationSummary(details: unknown): string {
  const fields = validationDetails(details);
  if (!fields.length) return '';
  return fields
    .map((f) => (f.field ? `${f.field}: ${f.messages.join(', ')}` : f.messages.join(', ')))
    .join(' · ');
}
