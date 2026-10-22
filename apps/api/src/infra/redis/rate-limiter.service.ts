import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { REDIS } from './redis.constants';

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  retryAfterSec: number;
}

/** Fixed-window counters in Redis under `rl:{scope}:{id}` (TRD §8). */
@Injectable()
export class RateLimiter {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async hit(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
    const results = await this.redis.multi().incr(key).ttl(key).exec();
    const count = Number(results?.[0]?.[1] ?? 1);
    let ttl = Number(results?.[1]?.[1] ?? -1);
    if (ttl < 0) {
      // First hit in the window (or a key that somehow lost its expiry): start the window now.
      await this.redis.expire(key, windowSec);
      ttl = windowSec;
    }
    return { allowed: count <= limit, count, retryAfterSec: ttl };
  }

  /** Counts a hit and throws 429 RATE_LIMITED when over the limit. */
  async consume(key: string, limit: number, windowSec: number, code: string = ErrorCode.RATE_LIMITED): Promise<void> {
    const r = await this.hit(key, limit, windowSec);
    if (!r.allowed) {
      throw new AppException(code, 'Too many attempts. Please try again later.', HttpStatus.TOO_MANY_REQUESTS, {
        retryAfterSec: r.retryAfterSec,
      });
    }
  }
}
