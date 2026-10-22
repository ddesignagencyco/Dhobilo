import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { boundingBox } from '../../common/geo/haversine';
import { fmt, money } from '../../common/money/money';
import { Clock } from '../../common/time/clock';
import { localParts } from '../../common/time/zoned';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { DiscoveryCache } from './discovery.cache';
import { SearchVendorsQueryDto, VendorSort } from './dto/discovery.dto';

/** No vendor serves further than this (HTTP-level cap on VendorProfile.serviceRadiusKm), so it bounds the prefilter. */
export const MAX_SERVICE_RADIUS_KM = 50;
/** Search coordinates are rounded to ~110 m: better cache hit rate and the exact location isn't needed or kept. */
const COORD_DECIMALS = 3;

export interface VendorCard {
  id: string;
  businessName: string;
  description: string | null;
  cityId: number;
  lat: number;
  lng: number;
  distanceKm: number;
  ratingAvg: number;
  ratingCount: number;
  serviceRadiusKm: number;
  minPrice: string;
  minTurnaroundHours: number;
  serviceTypes: string[];
}

export interface VendorPage {
  items: VendorCard[];
  nextCursor: string | null;
}

interface Row {
  id: string;
  businessName: string;
  description: string | null;
  cityId: number;
  lat: number;
  lng: number;
  distanceKm: Prisma.Decimal;
  ratingAvg: Prisma.Decimal;
  ratingCount: number;
  serviceRadiusKm: Prisma.Decimal;
  minPrice: Prisma.Decimal;
  minTurnaroundHours: number;
  serviceTypes: string[];
}

interface CursorValue {
  o: VendorSort;
  s: string;
  i: string;
}

const round = (n: number) => Number(n.toFixed(COORD_DECIMALS));
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

@Injectable()
export class DiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: DiscoveryCache,
    private readonly clock: Clock,
  ) {}

  /**
   * Vendors a customer can order from right now (FR-C3): APPROVED, OPEN, inside today's opening hours, with at
   * least one active item, and whose own service radius reaches the customer. Keyset pagination, 60 s cache.
   */
  async search(q: SearchVendorsQueryDto): Promise<VendorPage> {
    const sort: VendorSort = q.sort ?? 'distance';
    const limit = q.limit ?? 20;
    const lat = round(q.lat);
    const lng = round(q.lng);
    const cursor = q.cursor ? this.decodeCursor(q.cursor, sort) : undefined;

    // Opening hours depend on the minute, the cache lives 60 s: key on the filters only.
    const filters = { lat, lng, cityId: q.cityId, q: q.q?.toLowerCase(), serviceType: q.serviceType, minRating: q.minRating, maxPrice: q.maxPrice, sort, limit, cursor: q.cursor };
    const key = await this.cache.key(q.cityId, filters);
    const cached = await this.cache.get<VendorPage>(key);
    if (cached) return cached;

    const page = await this.query({ ...q, lat, lng, sort, limit }, cursor);
    await this.cache.set(key, page);
    return page;
  }

  private async query(q: SearchVendorsQueryDto & { sort: VendorSort; limit: number }, cursor?: CursorValue): Promise<VendorPage> {
    const { lat, lng, sort, limit } = q;
    const box = boundingBox(lat, lng, MAX_SERVICE_RADIUS_KM);
    const now = this.clock.now();

    const localTs = Prisma.sql`(${now}::timestamptz AT TIME ZONE c."timezone")`;
    const vendorFilters = [
      q.cityId ? Prisma.sql`AND v."cityId" = ${q.cityId}` : Prisma.empty,
      q.q ? Prisma.sql`AND v."businessName" ILIKE ${'%' + escapeLike(q.q) + '%'}` : Prisma.empty,
      q.minRating !== undefined ? Prisma.sql`AND v."ratingAvg" >= ${q.minRating}` : Prisma.empty,
    ];
    const candidateFilters = [
      q.serviceType ? Prisma.sql`AND ${q.serviceType} = ANY("serviceTypes")` : Prisma.empty,
      q.maxPrice !== undefined ? Prisma.sql`AND "minPrice" <= ${q.maxPrice}` : Prisma.empty,
      this.keyset(sort, cursor),
    ];
    const orderBy =
      sort === 'rating'
        ? Prisma.sql`"ratingAvg" DESC, id ASC`
        : sort === 'price'
          ? Prisma.sql`"minPrice" ASC, id ASC`
          : Prisma.sql`"distanceKm" ASC, id ASC`;

    const rows = await this.prisma.$queryRaw<Row[]>(Prisma.sql`
      WITH cand AS (
        SELECT v.id, v."businessName", v.description, v."cityId", v.lat, v.lng, v."ratingAvg", v."ratingCount",
               v."serviceRadiusKm",
               ROUND((6371 * 2 * ASIN(LEAST(1, SQRT(
                 POWER(SIN(RADIANS(v.lat - ${lat}) / 2), 2) +
                 COS(RADIANS(${lat})) * COS(RADIANS(v.lat)) * POWER(SIN(RADIANS(v.lng - ${lng}) / 2), 2)
               ))))::numeric, 3) AS "distanceKm",
               (SELECT MIN(si.price) FROM "ServiceItem" si
                 WHERE si."vendorId" = v.id AND si."isActive" AND si."deletedAt" IS NULL) AS "minPrice",
               (SELECT MIN(si."turnaroundHours") FROM "ServiceItem" si
                 WHERE si."vendorId" = v.id AND si."isActive" AND si."deletedAt" IS NULL) AS "minTurnaroundHours",
               (SELECT ARRAY_AGG(DISTINCT si."serviceType"::text) FROM "ServiceItem" si
                 WHERE si."vendorId" = v.id AND si."isActive" AND si."deletedAt" IS NULL) AS "serviceTypes"
        FROM "Vendor" v
        JOIN "City" c ON c.id = v."cityId"
        WHERE v.status = 'APPROVED' AND v.availability = 'OPEN' AND c."isActive"
          AND v.lat BETWEEN ${box.minLat} AND ${box.maxLat}
          AND v.lng BETWEEN ${box.minLng} AND ${box.maxLng}
          ${Prisma.join(vendorFilters, ' ')}
          AND EXISTS (
            SELECT 1 FROM "VendorHours" h
            WHERE h."vendorId" = v.id
              AND h."dayOfWeek" = EXTRACT(DOW FROM ${localTs})::int
              AND h."opensAt" <= (EXTRACT(HOUR FROM ${localTs}) * 60 + EXTRACT(MINUTE FROM ${localTs}))::int
              AND h."closesAt" >  (EXTRACT(HOUR FROM ${localTs}) * 60 + EXTRACT(MINUTE FROM ${localTs}))::int
          )
      )
      SELECT * FROM cand
      WHERE "minPrice" IS NOT NULL
        AND "distanceKm" <= "serviceRadiusKm"
        ${Prisma.join(candidateFilters, ' ')}
      ORDER BY ${orderBy}
      LIMIT ${limit + 1}
    `);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(
      (r): VendorCard => ({
        id: r.id,
        businessName: r.businessName,
        description: r.description,
        cityId: r.cityId,
        lat: r.lat,
        lng: r.lng,
        distanceKm: Number(r.distanceKm),
        ratingAvg: Number(r.ratingAvg),
        ratingCount: r.ratingCount,
        serviceRadiusKm: Number(r.serviceRadiusKm),
        minPrice: fmt(money(r.minPrice)),
        minTurnaroundHours: r.minTurnaroundHours,
        serviceTypes: r.serviceTypes ?? [],
      }),
    );
    return { items, nextCursor: hasMore ? this.encodeCursor(sort, rows[limit - 1]) : null };
  }

  /** "Rows strictly after the cursor" for each sort order; ties on the sort value are broken by id. */
  private keyset(sort: VendorSort, c?: CursorValue): Prisma.Sql {
    if (!c) return Prisma.empty;
    if (sort === 'rating') {
      return Prisma.sql`AND ("ratingAvg" < ${c.s}::numeric OR ("ratingAvg" = ${c.s}::numeric AND id > ${c.i}::uuid))`;
    }
    const column = sort === 'price' ? Prisma.sql`"minPrice"` : Prisma.sql`"distanceKm"`;
    return Prisma.sql`AND (${column} > ${c.s}::numeric OR (${column} = ${c.s}::numeric AND id > ${c.i}::uuid))`;
  }

  private encodeCursor(sort: VendorSort, last: Row): string {
    const s = sort === 'rating' ? last.ratingAvg : sort === 'price' ? last.minPrice : last.distanceKm;
    return Buffer.from(JSON.stringify({ o: sort, s: s.toString(), i: last.id } satisfies CursorValue)).toString('base64url');
  }

  private decodeCursor(raw: string, sort: VendorSort): CursorValue {
    try {
      const c = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as CursorValue;
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (c.o !== sort || !/^\d+(\.\d+)?$/.test(String(c.s)) || !uuid.test(String(c.i))) throw new Error('bad cursor');
      return { o: c.o, s: String(c.s), i: c.i };
    } catch {
      throw new AppException('INVALID_CURSOR', 'The pagination cursor is invalid for this search.', HttpStatus.BAD_REQUEST);
    }
  }

  /** Public vendor page (FR-C4). Hidden (404) unless APPROVED in an active city. */
  async vendorDetail(id: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id, status: 'APPROVED', city: { isActive: true } },
      select: {
        id: true,
        businessName: true,
        description: true,
        addressLine: true,
        cityId: true,
        lat: true,
        lng: true,
        availability: true,
        serviceRadiusKm: true,
        respondWithinMin: true,
        ratingAvg: true,
        ratingCount: true,
        city: { select: { id: true, name: true, nameUr: true, timezone: true, deliveryFee: true } },
        hours: { select: { dayOfWeek: true, opensAt: true, closesAt: true }, orderBy: { dayOfWeek: 'asc' } },
      },
    });
    if (!vendor) throw this.notFound();

    const items = await this.prisma.serviceItem.aggregate({
      where: { vendorId: id, isActive: true, deletedAt: null },
      _min: { price: true, turnaroundHours: true },
    });
    const types = await this.prisma.serviceItem.findMany({
      where: { vendorId: id, isActive: true, deletedAt: null },
      distinct: ['serviceType'],
      select: { serviceType: true },
    });

    const local = localParts(this.clock.now(), vendor.city.timezone);
    const today = vendor.hours.find((h) => h.dayOfWeek === local.dayOfWeek);
    const withinHours = !!today && today.opensAt <= local.minutes && local.minutes < today.closesAt;

    const { city, ...rest } = vendor;
    return {
      ...rest,
      city: { ...city, deliveryFee: fmt(money(city.deliveryFee)) },
      minPrice: items._min.price ? fmt(money(items._min.price)) : null,
      minTurnaroundHours: items._min.turnaroundHours,
      serviceTypes: types.map((t) => t.serviceType),
      /** True when a customer could order right now. */
      openNow: vendor.availability === 'OPEN' && withinHours,
    };
  }

  /** Public catalog (FR-C4): active items grouped by category, bilingual names, current prices. */
  async catalog(vendorId: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id: vendorId, status: 'APPROVED', city: { isActive: true } },
      select: { id: true },
    });
    if (!vendor) throw this.notFound();

    const categories = await this.prisma.serviceCategory.findMany({
      where: { items: { some: { vendorId, isActive: true, deletedAt: null } } },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        nameUr: true,
        items: {
          where: { vendorId, isActive: true, deletedAt: null },
          orderBy: { itemName: 'asc' },
          select: { id: true, itemName: true, itemNameUr: true, serviceType: true, price: true, turnaroundHours: true },
        },
      },
    });
    return {
      vendorId,
      currency: 'PKR',
      categories: categories.map((c) => ({ ...c, items: c.items.map((i) => ({ ...i, price: fmt(money(i.price)) })) })),
    };
  }

  private notFound(): AppException {
    return new AppException(ErrorCode.NOT_FOUND, 'Vendor not found.', HttpStatus.NOT_FOUND);
  }
}
