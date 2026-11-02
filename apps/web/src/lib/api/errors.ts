import {
  type ApiErrorBody,
  adminErrorMessage,
  isAccountErrorCode,
  isRetryableErrorCode,
  isSessionErrorCode,
  validationDetails,
  validationSummary,
  type FieldError,
} from '@dhoblio/shared';

/**
 * A failed API call, carrying the server's stable `code` and `requestId`.
 *
 * The requestId is the whole point of showing an error at all: it is what lets whoever is on support
 * find the matching line in the API's pino log. Every error surface in the panel renders it.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | undefined;

  constructor(status: number, body: Partial<ApiErrorBody['error']> | undefined, fallback?: string) {
    const code = body?.code ?? 'INTERNAL_ERROR';
    super(adminErrorMessage(code, body?.message ?? fallback));
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = body?.details;
    this.requestId = body?.requestId;
  }

  get isRetryable(): boolean {
    return isRetryableErrorCode(this.code);
  }

  /** The session is gone: clear it and send the admin to the login screen. */
  get isSessionExpired(): boolean {
    return isSessionErrorCode(this.code) || this.status === 401;
  }

  /** Signed in, but not allowed here. Re-login will not help; this is a wrong-role or wrong-area call. */
  get isForbidden(): boolean {
    return this.code === 'FORBIDDEN' || this.status === 403;
  }

  get isAccountProblem(): boolean {
    return isAccountErrorCode(this.code);
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get fieldErrors(): FieldError[] {
    return validationDetails(this.details);
  }

  get validationSummary(): string {
    return validationSummary(this.details);
  }

  /** Safe to show an admin, including the trace handle. */
  toDisplay(): { message: string; code: string; requestId?: string } {
    return { message: this.message, code: this.code, requestId: this.requestId };
  }
}

/** The network never reached the API (DNS, connection refused, timeout). Distinct from an API error. */
export class ApiUnreachableError extends Error {
  constructor(cause?: unknown) {
    super('Could not reach the Dhoblio API. Check your connection and try again.');
    this.name = 'ApiUnreachableError';
    this.cause = cause;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}
