import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitOptions {
  /** Short name, part of the Redis key and of the log line when someone is limited. */
  name: string;
  limit: number;
  windowSec: number;
  /** Who is counted: the signed-in user (falls back to the IP when nobody is signed in) or always the IP. */
  by?: 'user' | 'ip';
}

/**
 * A stricter limit than the global default for one route (OTP-style abuse targets: promo guessing, payment
 * starts, uploads, registrations). Counted per user or per IP in Redis; over the limit answers 429 RATE_LIMITED.
 */
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);
