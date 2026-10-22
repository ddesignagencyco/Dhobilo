import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobStatus, JobType, RiderStatus } from '@prisma/client';
import { Clock } from '../../common/time/clock';
import type { Env } from '../../config/env';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { NotificationOrchestrator } from '../notifications/notification-orchestrator';
import { CourierService } from './courier/courier.service';
import { DeliveryJobsService } from './delivery-jobs.service';
import { DispatchScheduler } from './dispatch.scheduler';
import { OpsAlertService } from './ops-alert.service';
import { RiderPresenceService } from './rider-presence.service';

/** Each failed search round (or lapsed offer) widens the circle, then it stays at the last size. */
export const SEARCH_RADII_KM = [3, 6, 10, 15, 25] as const;
/** After an ops alert the search keeps going, but less often. */
const SLOW_RETRY_FACTOR = 4;

export type DispatchOutcome = 'offered' | 'partner' | 'waiting' | 'skipped';

/**
 * Auto-dispatch (FR-R2, TRD §9): finds the nearest online, approved rider who isn't busy and offers them the job.
 * An offer that isn't accepted in time lapses and the next rider is tried; if nobody can be found the search widens
 * and retries, and ops is alerted once. In a city served by a courier partner the job goes to the partner instead.
 */
@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: RiderPresenceService,
    private readonly jobs: DeliveryJobsService,
    private readonly courier: CourierService,
    private readonly scheduler: DispatchScheduler,
    private readonly notifier: NotificationOrchestrator,
    private readonly ops: OpsAlertService,
    private readonly config: ConfigService<Env, true>,
    private readonly clock: Clock,
  ) {}

  async dispatch(jobId: string): Promise<DispatchOutcome> {
    const job = await this.prisma.deliveryJob.findUnique({
      where: { id: jobId },
      include: {
        order: {
          select: {
            orderNo: true,
            cityId: true,
            addressSnapshot: true,
            vendor: { select: { lat: true, lng: true } },
            city: { select: { courierPartner: true } },
          },
        },
      },
    });
    if (!job || job.status !== JobStatus.UNASSIGNED) return 'skipped';

    // Too early: come back when the search window opens.
    const wait = this.jobs.delayUntilSearch(job.scheduledStart);
    if (wait > 1000) {
      await this.scheduler.dispatch(jobId, wait);
      return 'waiting';
    }

    const partner = job.order.city.courierPartner;
    if (partner?.isActive) {
      await this.courier.handOff(jobId, partner);
      return 'partner';
    }

    const snapshot = job.order.addressSnapshot as { lat: number; lng: number };
    // The first stop is where the rider has to go first: the customer for a pickup, the shop for a delivery.
    const origin = job.jobType === JobType.PICKUP ? snapshot : job.order.vendor;
    const radius = SEARCH_RADII_KM[Math.min(job.dispatchAttempts, SEARCH_RADII_KM.length - 1)];

    const nearby = await this.presence.nearby(job.order.cityId, origin.lat, origin.lng, radius);
    const wanted = nearby.filter((n) => !job.declinedRiderIds.includes(n.riderId));
    if (wanted.length > 0) {
      const eligible = await this.prisma.rider.findMany({
        where: { id: { in: wanted.map((w) => w.riderId) }, status: RiderStatus.APPROVED, isOnline: true },
        select: { id: true, userId: true },
      });
      const byId = new Map(eligible.map((r) => [r.id, r]));
      for (const { riderId } of wanted) {
        const rider = byId.get(riderId);
        if (!rider) continue;
        if (!(await this.jobs.offer(jobId, rider.id))) continue;

        const timeoutSec = this.config.get('DISPATCH_OFFER_TIMEOUT_SEC', { infer: true });
        await this.notifier.notifyUser(
          rider.userId,
          'rider_job_offer',
          { orderNo: job.order.orderNo, jobType: job.jobType === JobType.PICKUP ? 'pickup' : 'delivery', minutes: Math.max(Math.round(timeoutSec / 60), 1) },
          { jobId, orderId: job.orderId, type: 'RIDER_JOB_OFFER' },
        );
        await this.scheduler.offerTimeout(jobId, rider.id, timeoutSec * 1000);
        return 'offered';
      }
    }

    // Nobody this round: widen the search and try again later; tell ops once if it keeps failing.
    const attempts = job.dispatchAttempts + 1;
    const alert = attempts >= this.config.get('DISPATCH_MAX_ATTEMPTS', { infer: true }) && !job.unassignedAlertedAt;
    await this.prisma.deliveryJob.update({
      where: { id: jobId },
      data: { dispatchAttempts: { increment: 1 }, ...(alert ? { unassignedAlertedAt: this.clock.now() } : {}) },
    });
    if (alert) {
      await this.ops.alert(
        'No rider available for a job',
        `Order ${job.order.orderNo} (${job.jobType.toLowerCase()}) has had no taker after ${attempts} searches. Assign a rider from the dispatch board.`,
        { jobId, orderId: job.orderId, cityId: job.order.cityId },
      );
    }
    const retryMs = this.config.get('DISPATCH_RETRY_SEC', { infer: true }) * 1000 * (job.unassignedAlertedAt || alert ? SLOW_RETRY_FACTOR : 1);
    await this.scheduler.dispatch(jobId, retryMs);
    return 'waiting';
  }

  /** The rider didn't answer: take the offer back and look for the next one. */
  async offerTimedOut(jobId: string, riderId: string): Promise<boolean> {
    const lapsed = await this.jobs.expireOffer(jobId, riderId);
    if (lapsed) await this.scheduler.dispatch(jobId);
    return lapsed;
  }

  /**
   * Safety net for work whose delayed job was lost (Redis restart, failed enqueue): searches for unassigned jobs that
   * should already be in progress and expires offers that have been out too long.
   */
  async sweep(): Promise<{ redispatched: number; expired: number }> {
    const now = this.clock.now();
    const leadMs = this.config.get('DISPATCH_LEAD_MIN', { infer: true }) * 60_000;
    const retryMs = this.config.get('DISPATCH_RETRY_SEC', { infer: true }) * 1000;
    const offerMs = this.config.get('DISPATCH_OFFER_TIMEOUT_SEC', { infer: true }) * 1000;

    // Jobs a live search chain keeps touching every retry; one untouched for much longer than that has lost its chain.
    const stuck = await this.prisma.deliveryJob.findMany({
      where: {
        status: JobStatus.UNASSIGNED,
        partnerId: null,
        scheduledStart: { lte: new Date(now.getTime() + leadMs) },
        updatedAt: { lte: new Date(now.getTime() - retryMs * SLOW_RETRY_FACTOR * 2) },
      },
      orderBy: { scheduledStart: 'asc' },
      take: 100,
      select: { id: true },
    });
    for (const { id } of stuck) await this.scheduler.dispatch(id);

    const lapsed = await this.prisma.deliveryJob.findMany({
      where: { status: JobStatus.ASSIGNED, assignedAt: { lte: new Date(now.getTime() - offerMs * 2) } },
      take: 100,
      select: { id: true, riderId: true },
    });
    let expired = 0;
    for (const j of lapsed) {
      if (j.riderId && (await this.offerTimedOut(j.id, j.riderId))) expired++;
    }
    return { redispatched: stuck.length, expired };
  }
}
