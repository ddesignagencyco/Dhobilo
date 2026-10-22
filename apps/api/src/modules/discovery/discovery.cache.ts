import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import Redis from 'ioredis';
import { DomainEvent } from '../../common/events/domain-events';
import { REDIS } from '../../infra/redis/redis.constants';

const VERSION_KEY = 'disc:ver';
export const DISCOVERY_TTL_SEC = 60;

/**
 * Redis cache for vendor search pages (TRD §8: `disc:{cityId}:{hash(filters)}`, 60 s).
 * Invalidation is a version bump: every key embeds the current version, so one INCR makes all cached pages
 * unreachable (they expire on their own) without scanning or deleting keys. Redis is only a cache: if it
 * is down the search just runs against Postgres.
 */
@Injectable()
export class DiscoveryCache {
  private readonly logger = new Logger(DiscoveryCache.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async key(cityId: number | undefined, filters: unknown): Promise<string | null> {
    try {
      const version = (await this.redis.get(VERSION_KEY)) ?? '0';
      const hash = createHash('sha1').update(JSON.stringify(filters)).digest('hex').slice(0, 24);
      return `disc:${version}:${cityId ?? 'all'}:${hash}`;
    } catch (err) {
      this.logger.warn({ err }, 'Discovery cache unavailable');
      return null;
    }
  }

  async get<T>(key: string | null): Promise<T | null> {
    if (!key) return null;
    try {
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      this.logger.warn({ err }, 'Discovery cache read failed');
      return null;
    }
  }

  async set(key: string | null, value: unknown): Promise<void> {
    if (!key) return;
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', DISCOVERY_TTL_SEC);
    } catch (err) {
      this.logger.warn({ err }, 'Discovery cache write failed');
    }
  }

  @OnEvent(DomainEvent.VENDOR_CHANGED, { async: false })
  async invalidate(): Promise<void> {
    try {
      await this.redis.incr(VERSION_KEY);
    } catch (err) {
      this.logger.error({ err }, 'Could not invalidate the discovery cache; results may be stale for up to 60 s');
    }
  }
}
