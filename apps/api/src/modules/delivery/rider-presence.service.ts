import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { Env } from '../../config/env';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { REDIS } from '../../infra/redis/redis.constants';

export const riderGeoKey = (cityId: number) => `rider:geo:${cityId}`;
export const riderBeatKey = (riderId: string) => `rider:beat:${riderId}`;
const dbWriteKey = (riderId: string) => `rider:dbwrite:${riderId}`;
/** The database copy of a rider's position is refreshed at most this often; Redis always has the latest. */
const DB_WRITE_EVERY_SEC = 30;

export interface NearbyRider {
  riderId: string;
  distanceKm: number;
}

/**
 * Who is online and where (FR-R2). Positions live in a Redis GEO set per city; a short-lived "heartbeat" key says the
 * rider pinged recently. A rider who goes quiet (phone died, no signal) stops being offered work once the heartbeat
 * expires, without anyone having to mark them offline. Postgres keeps a slow-moving copy for the admin board.
 */
@Injectable()
export class RiderPresenceService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get ttl() {
    return this.config.get('RIDER_HEARTBEAT_TTL_SEC', { infer: true });
  }

  async ping(riderId: string, cityId: number, lat: number, lng: number): Promise<void> {
    await this.redis
      .multi()
      .geoadd(riderGeoKey(cityId), lng, lat, riderId)
      .set(riderBeatKey(riderId), JSON.stringify({ lat, lng, at: Date.now() }), 'EX', this.ttl)
      .exec();
    // Postgres gets a position now and then (not on every ping).
    if (await this.redis.set(dbWriteKey(riderId), '1', 'EX', DB_WRITE_EVERY_SEC, 'NX')) {
      await this.prisma.rider.update({ where: { id: riderId }, data: { lastLat: lat, lastLng: lng, lastSeenAt: new Date() } });
    }
  }

  /** Takes the rider out of the search: used when they go offline or are suspended. */
  async remove(riderId: string, cityId: number): Promise<void> {
    await this.redis.multi().zrem(riderGeoKey(cityId), riderId).del(riderBeatKey(riderId), dbWriteKey(riderId)).exec();
  }

  /** Latest known position, or null if the rider has not pinged within the heartbeat window. */
  async position(riderId: string): Promise<{ lat: number; lng: number; at: Date } | null> {
    const raw = await this.redis.get(riderBeatKey(riderId));
    if (!raw) return null;
    const p = JSON.parse(raw) as { lat: number; lng: number; at: number };
    return { lat: p.lat, lng: p.lng, at: new Date(p.at) };
  }

  /** Reachable riders within `radiusKm` of a point, nearest first. Riders whose heartbeat lapsed are skipped (and tidied away). */
  async nearby(cityId: number, lat: number, lng: number, radiusKm: number, limit = 50): Promise<NearbyRider[]> {
    const hits = (await this.redis.geosearch(riderGeoKey(cityId), 'FROMLONLAT', lng, lat, 'BYRADIUS', radiusKm, 'km', 'ASC', 'COUNT', limit, 'WITHDIST')) as [string, string][];
    if (hits.length === 0) return [];
    const beats = await this.redis.mget(hits.map(([id]) => riderBeatKey(id)));
    const alive: NearbyRider[] = [];
    const stale: string[] = [];
    hits.forEach(([riderId, dist], i) => {
      if (beats[i]) alive.push({ riderId, distanceKm: Number(dist) });
      else stale.push(riderId);
    });
    if (stale.length) await this.redis.zrem(riderGeoKey(cityId), ...stale);
    return alive;
  }
}
