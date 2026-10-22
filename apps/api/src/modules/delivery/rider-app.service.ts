import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobStatus, Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { haversineKm } from '../../common/geo/haversine';
import { isInPakistan } from '../../common/geo/pakistan';
import { fmt, money } from '../../common/money/money';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, beforeCursor, sliceWithCursor } from '../../common/pagination/cursor';
import { Clock } from '../../common/time/clock';
import { addDays, localParts, localToUtc } from '../../common/time/zoned';
import type { Env } from '../../config/env';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ACTIVE_JOB_STATUSES } from './job-state-machine';
import { EarningsQueryDto, MyJobsQueryDto } from './dto/rider.dto';
import { JobRow, jobInclude, toRiderJobView } from './job-view';
import type { RiderContext } from './rider-context';
import { RiderPresenceService } from './rider-presence.service';

/** What the rider app reads and the simple switches it flips: availability, location, job lists, earnings. */
@Injectable()
export class RiderAppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: RiderPresenceService,
    private readonly config: ConfigService<Env, true>,
    private readonly clock: Clock,
  ) {}

  async me(rider: RiderContext) {
    const row = await this.prisma.rider.findUniqueOrThrow({
      where: { id: rider.id },
      select: { id: true, status: true, cityId: true, isOnline: true, photoUrl: true, rejectionReason: true, approvedAt: true, lastSeenAt: true, user: { select: { name: true, phone: true } } },
    });
    const [active, today] = await Promise.all([
      this.prisma.deliveryJob.count({ where: { riderId: rider.id, status: { in: [...ACTIVE_JOB_STATUSES] } } }),
      this.earnings(rider, {}),
    ]);
    const { user, ...rest } = row;
    return { ...rest, name: user.name, phone: user.phone, activeJobs: active, maxActiveJobs: this.config.get('RIDER_MAX_ACTIVE_JOBS', { infer: true }), today: today.days.at(-1) ?? { day: null, jobs: 0, earned: '0.00' } };
  }

  /** Registration status for riders who are not approved yet (so the app can show "waiting for review"). */
  async status(userId: string) {
    const rider = await this.prisma.rider.findUnique({ where: { userId }, select: { id: true, status: true, rejectionReason: true, createdAt: true, approvedAt: true } });
    if (!rider) throw new AppException('RIDER_NOT_REGISTERED', 'No rider account is linked to this user.', HttpStatus.NOT_FOUND);
    return rider;
  }

  /** Going online needs a position, so the rider can be found straight away. */
  async goOnline(rider: RiderContext, lat: number, lng: number) {
    this.assertPosition(lat, lng);
    await this.prisma.rider.update({ where: { id: rider.id }, data: { isOnline: true, lastLat: lat, lastLng: lng, lastSeenAt: this.clock.now() } });
    await this.presence.ping(rider.id, rider.cityId, lat, lng);
    return { isOnline: true };
  }

  async goOffline(rider: RiderContext) {
    await this.prisma.rider.update({ where: { id: rider.id }, data: { isOnline: false } });
    await this.presence.remove(rider.id, rider.cityId);
    return { isOnline: false };
  }

  /** Location ping while online. Riders who forget to go offline simply stop being offered work when the pings stop. */
  async ping(rider: RiderContext, lat: number, lng: number) {
    if (!rider.isOnline) throw new AppException('RIDER_OFFLINE', 'Go online first.', HttpStatus.CONFLICT);
    this.assertPosition(lat, lng);
    await this.presence.ping(rider.id, rider.cityId, lat, lng);
    return { ok: true };
  }

  /** Unassigned jobs in the rider's city whose time window is near, nearest first when the rider's position is known. */
  async available(rider: RiderContext, limit = 20) {
    const lead = this.config.get('DISPATCH_LEAD_MIN', { infer: true }) * 60_000;
    const jobs = await this.prisma.deliveryJob.findMany({
      where: {
        status: JobStatus.UNASSIGNED,
        partnerId: null,
        order: { cityId: rider.cityId },
        scheduledStart: { lte: new Date(this.clock.now().getTime() + lead) },
        NOT: { declinedRiderIds: { has: rider.id } },
      },
      orderBy: [{ scheduledStart: 'asc' }, { id: 'asc' }],
      take: 100,
      include: jobInclude,
    });
    const here = (await this.presence.position(rider.id)) ?? (await this.lastKnown(rider.id));
    const views = jobs.map((j) => {
      const first = j.jobType === 'PICKUP' ? (j.order.addressSnapshot as { lat: number; lng: number }) : j.order.vendor;
      const distanceKm = here ? Math.round(haversineKm(here.lat, here.lng, first.lat, first.lng) * 10) / 10 : null;
      return toRiderJobView(j, { distanceKm });
    });
    if (here) views.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
    return views.slice(0, Math.min(limit, 50));
  }

  async myJobs(rider: RiderContext, q: MyJobsQueryDto) {
    const limit = Math.min(q.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const history = q.view === 'history';
    const rows = await this.prisma.deliveryJob.findMany({
      where: {
        riderId: rider.id,
        status: history ? { in: [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED] } : { in: [...ACTIVE_JOB_STATUSES] },
        ...(history ? beforeCursor(q.cursor) : {}),
      },
      orderBy: history ? [{ createdAt: 'desc' }, { id: 'desc' }] : [{ scheduledStart: 'asc' }, { id: 'asc' }],
      take: history ? limit + 1 : 50,
      include: jobInclude,
    });
    const timeoutMs = this.config.get('DISPATCH_OFFER_TIMEOUT_SEC', { infer: true }) * 1000;
    const view = (j: JobRow) => toRiderJobView(j, { offerExpiresAt: j.status === JobStatus.ASSIGNED && j.assignedAt ? new Date(j.assignedAt.getTime() + timeoutMs) : null });
    if (!history) return { items: rows.map(view), nextCursor: null };
    const { items, nextCursor } = sliceWithCursor(rows, limit);
    return { items: items.map(view), nextCursor };
  }

  async job(rider: RiderContext, jobId: string) {
    const row = await this.prisma.deliveryJob.findFirst({
      where: { id: jobId, OR: [{ riderId: rider.id }, { status: JobStatus.UNASSIGNED, partnerId: null, order: { cityId: rider.cityId } }] },
      include: jobInclude,
    });
    if (!row) throw new AppException(ErrorCode.NOT_FOUND, 'Delivery job not found.', HttpStatus.NOT_FOUND);
    const timeoutMs = this.config.get('DISPATCH_OFFER_TIMEOUT_SEC', { infer: true }) * 1000;
    return toRiderJobView(row, { offerExpiresAt: row.status === JobStatus.ASSIGNED && row.assignedAt ? new Date(row.assignedAt.getTime() + timeoutMs) : null });
  }

  /** Completed jobs and what they paid, per day on the city's calendar (FR-R6). */
  async earnings(rider: RiderContext, q: EarningsQueryDto) {
    const city = await this.prisma.city.findUniqueOrThrow({ where: { id: rider.cityId }, select: { timezone: true } });
    const tz = city.timezone;
    const today = localParts(this.clock.now(), tz).date;
    const to = q.to ?? today;
    const from = q.from ?? addDays(to, -6);
    if (from > to) throw new AppException('INVALID_RANGE', '`from` must not be after `to`.', HttpStatus.BAD_REQUEST);
    if (addDays(from, 92) < to) throw new AppException('INVALID_RANGE', 'Ask for at most 92 days at a time.', HttpStatus.BAD_REQUEST);
    const start = localToUtc(from, 0, tz);
    const end = localToUtc(addDays(to, 1), 0, tz);

    const rows = await this.prisma.$queryRaw<{ day: string; jobs: number; earned: Prisma.Decimal }[]>`
      SELECT to_char(("completedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day,
             count(*)::int AS jobs,
             COALESCE(sum("riderFee"), 0) AS earned
        FROM "DeliveryJob"
       WHERE "riderId" = ${rider.id}::uuid AND status = 'COMPLETED'
         AND "completedAt" >= ${start} AND "completedAt" < ${end}
       GROUP BY 1 ORDER BY 1`;
    const days = rows.map((r) => ({ day: r.day, jobs: r.jobs, earned: fmt(money(r.earned)) }));
    return {
      from,
      to,
      currency: 'PKR',
      days,
      totals: { jobs: days.reduce((n, d) => n + d.jobs, 0), earned: fmt(rows.reduce((s, r) => s.plus(money(r.earned)), money(0))) },
    };
  }

  private async lastKnown(riderId: string) {
    const r = await this.prisma.rider.findUnique({ where: { id: riderId }, select: { lastLat: true, lastLng: true } });
    return r?.lastLat != null && r.lastLng != null ? { lat: r.lastLat, lng: r.lastLng } : null;
  }

  private assertPosition(lat: number, lng: number): void {
    if (!isInPakistan(lat, lng)) {
      throw new AppException('LOCATION_OUT_OF_RANGE', 'The location must be inside Pakistan.', HttpStatus.BAD_REQUEST);
    }
  }
}
