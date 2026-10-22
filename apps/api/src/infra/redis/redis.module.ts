import { Global, Inject, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { Env } from '../../config/env';
import { RateLimiter } from './rate-limiter.service';
import { REDIS } from './redis.constants';

export { REDIS };

@Injectable()
class RedisShutdown implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}

/** Shared ioredis client for cache, OTP, rate limits, pub/sub publish. Redis is coordination only; Postgres is the source of truth. */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new Redis(config.get('REDIS_URL', { infer: true }), { maxRetriesPerRequest: 3, lazyConnect: false }),
    },
    RedisShutdown,
    RateLimiter,
  ],
  exports: [REDIS, RateLimiter],
})
export class RedisModule {}
