import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DeliveryJob, JobStatus, JobType, OrderStatus, Prisma, ProofType, Role } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { DeliveryJobChangedEvent, DomainEvent } from '../../common/events/domain-events';
import { Clock } from '../../common/time/clock';
import type { Env } from '../../config/env';
import { CloudinaryService, uploadFolder } from '../../infra/cloudinary/cloudinary.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RateLimiter } from '../../infra/redis/rate-limiter.service';
import { NotificationOrchestrator } from '../notifications/notification-orchestrator';
import { OrderLifecycleService } from '../orders/lifecycle/order-lifecycle.service';
import { DeliveryOtpService } from './delivery-otp.service';
import { CompleteJobDto } from './dto/rider.dto';
import { DispatchScheduler } from './dispatch.scheduler';
import { JobActor, OPEN_JOB_STATUSES, canMoveJob } from './job-state-machine';
import { OpsAlertService } from './ops-alert.service';
import type { RiderContext } from './rider-context';

const J = JobStatus;
const jobWord = (t: JobType) => (t === JobType.PICKUP ? 'pickup' : 'delivery') as 'pickup' | 'delivery';

/** Where the order must be for a job leg to start / finish. */
const ORDER_AFTER = {
  [JobType.PICKUP]: { finish: OrderStatus.PICKED_UP },
  [JobType.DROP]: { start: OrderStatus.OUT_FOR_DELIVERY, finish: OrderStatus.DELIVERED },
} as const;

interface MoveOptions {
  data?: Prisma.DeliveryJobUncheckedUpdateManyInput;
  /** Extra conditions the row must still meet (e.g. it is still held by this rider). */
  where?: Prisma.DeliveryJobWhereInput;
  /** Error to raise instead of the generic one when the row has moved on (e.g. JOB_ALREADY_TAKEN). */
  conflict?: AppException;
  requestId?: string;
}

/**
 * Everything that changes a delivery job (FR-R2..R6, TRD §9). Like orders, a job moves only through
 * `move()`: a legality check against the job state machine plus a compare-and-set update, so two riders racing for
 * one job, or a rider and an admin acting together, cannot both win. Job progress drives the order: finishing a
 * pickup marks it PICKED_UP, setting out with a delivery marks it OUT_FOR_DELIVERY, completing it DELIVERED.
 */
@Injectable()
export class DeliveryJobsService {
  private readonly logger = new Logger(DeliveryJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: OrderLifecycleService,
    private readonly events: EventEmitter2,
    private readonly config: ConfigService<Env, true>,
    private readonly clock: Clock,
    private readonly scheduler: DispatchScheduler,
    private readonly otp: DeliveryOtpService,
    private readonly cloudinary: CloudinaryService,
    private readonly notifier: NotificationOrchestrator,
    private readonly ops: OpsAlertService,
    private readonly limiter: RateLimiter,
  ) {}

  // ───────────────────────── creation & order sync ─────────────────────────

  /** Creates the pickup or delivery leg of an order (once: the order+type pair is unique) and starts looking for a rider. */
  async createForOrder(orderId: string, type: JobType, requestId?: string): Promise<DeliveryJob | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, pickupSlotStart: true, pickupSlotEnd: true, deliverySlotStart: true, deliverySlotEnd: true },
    });
    if (!order) return null;
    const pickup = type === JobType.PICKUP;
    const fee = this.config.get(pickup ? 'RIDER_FEE_PICKUP_PKR' : 'RIDER_FEE_DROP_PKR', { infer: true });

    const created = await this.prisma.deliveryJob.createMany({
      data: [
        {
          orderId,
          jobType: type,
          scheduledStart: pickup ? order.pickupSlotStart : order.deliverySlotStart,
          scheduledEnd: pickup ? order.pickupSlotEnd : order.deliverySlotEnd,
          riderFee: new Prisma.Decimal(fee),
        },
      ],
      skipDuplicates: true,
    });
    const job = await this.prisma.deliveryJob.findUniqueOrThrow({ where: { orderId_jobType_attempt: { orderId, jobType: type, attempt: 1 } } });
    if (created.count === 1) {
      this.emitChange(job, J.UNASSIGNED, 'SYSTEM');
      // Searching starts shortly before the window opens, not the moment the job exists.
      await this.scheduler.dispatch(job.id, this.delayUntilSearch(job.scheduledStart), { first: true });
    }
    return job;
  }

  /**
   * A redo adds a fresh pickup + delivery attempt to an already-delivered order. Attempts are unique per leg, so a
   * retried admin resolution cannot create a second pair of jobs.
   */
  async createRedoJobs(orderId: string, adminId: string, requestId?: string): Promise<DeliveryJob[]> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        pickupSlotStart: true,
        pickupSlotEnd: true,
        deliverySlotStart: true,
        deliverySlotEnd: true,
        jobs: { select: { attempt: true } },
      },
    });
    if (!order) throw this.notFound();
    if (order.status !== OrderStatus.DELIVERED) {
      throw new AppException('REDO_NOT_ALLOWED', 'A redo can only follow a delivered order.', HttpStatus.CONFLICT);
    }

    const nextAttempt = Math.max(0, ...order.jobs.map((j) => j.attempt)) + 1;
    const now = this.clock.now();
    const windowMs = Math.max(
      order.pickupSlotEnd.getTime() - order.pickupSlotStart.getTime(),
      order.deliverySlotEnd.getTime() - order.deliverySlotStart.getTime(),
      60 * 60_000,
    );
    const created = await this.prisma.deliveryJob.createMany({
      data: (['PICKUP', 'DROP'] as const).map((jobType) => ({
        orderId,
        jobType,
        attempt: nextAttempt,
        isRedo: true,
        scheduledStart: now,
        scheduledEnd: new Date(now.getTime() + windowMs),
        riderFee: new Prisma.Decimal(this.config.get(jobType === 'PICKUP' ? 'RIDER_FEE_PICKUP_PKR' : 'RIDER_FEE_DROP_PKR', { infer: true })),
      })),
      skipDuplicates: true,
    });
    const jobs = await this.prisma.deliveryJob.findMany({
      where: { orderId, attempt: nextAttempt },
      orderBy: { jobType: 'asc' },
    });
    if (created.count > 0) {
      for (const job of jobs) {
        this.emitChange(job, J.UNASSIGNED, 'ADMIN');
        await this.scheduler.dispatch(job.id);
      }
      for (const job of jobs) await this.audit('JOB_REDO_CREATED', job.id, adminId, { orderId, attempt: nextAttempt }, requestId);
    }
    return jobs;
  }

  /** Milliseconds until dispatch should start looking for this job's rider. */
  delayUntilSearch(scheduledStart: Date): number {
    const lead = this.config.get('DISPATCH_LEAD_MIN', { infer: true }) * 60_000;
    return Math.max(scheduledStart.getTime() - lead - this.clock.now().getTime(), 0);
  }

  /** The order is gone (cancelled / rejected) or the leg was done by someone else: stop the job and tell its rider. */
  async cancelOpenForOrder(orderId: string, reason: string, only?: JobType): Promise<number> {
    const jobs = await this.prisma.deliveryJob.findMany({
      where: { orderId, status: { in: [...OPEN_JOB_STATUSES] }, ...(only ? { jobType: only } : {}) },
      include: { rider: { select: { userId: true } }, order: { select: { orderNo: true } } },
    });
    let cancelled = 0;
    for (const job of jobs) {
      try {
        await this.move(job.id, job.status, J.CANCELLED, 'SYSTEM', { data: { failureReason: reason } });
        cancelled++;
        if (job.rider) {
          await this.notifier.notifyUser(
            job.rider.userId,
            'rider_job_cancelled',
            { orderNo: job.order.orderNo, jobType: jobWord(job.jobType), reason },
            { jobId: job.id, orderId, type: 'RIDER_JOB_CANCELLED' },
          );
        }
      } catch (err) {
        // Someone else moved it in the meantime; nothing more to do.
        this.logger.debug({ err, jobId: job.id }, 'Could not cancel a delivery job');
      }
    }
    return cancelled;
  }

  // ───────────────────────── rider actions ─────────────────────────

  /** Manual mode (FR-R2): take an unassigned job from the list. Of two riders claiming at once, exactly one wins. */
  async claim(rider: RiderContext, jobId: string, requestId?: string) {
    if (!rider.isOnline) throw new AppException('RIDER_OFFLINE', 'Go online to take jobs.', HttpStatus.CONFLICT);
    const job = await this.prisma.deliveryJob.findUnique({ where: { id: jobId }, include: { order: { select: { cityId: true } } } });
    if (!job || job.order.cityId !== rider.cityId || job.partnerId) throw this.notFound();
    if (job.declinedRiderIds.includes(rider.id)) {
      throw new AppException('JOB_NOT_AVAILABLE', 'You gave this job back, so it is not available to you.', HttpStatus.CONFLICT);
    }

    const taken = new AppException('JOB_ALREADY_TAKEN', 'Another rider took this job first.', HttpStatus.CONFLICT);
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lockRider(tx, rider.id);
      await this.assertCapacity(tx, rider.id);
      return this.move(jobId, J.UNASSIGNED, J.ACCEPTED, 'RIDER', { data: { riderId: rider.id, assignedAt: this.clock.now() }, where: { riderId: null }, conflict: taken, requestId }, tx);
    });
    await this.announceRider(updated, rider);
    return updated;
  }

  /** The rider an offer was made to accepts it. */
  async accept(rider: RiderContext, jobId: string, requestId?: string) {
    await this.assertHeldBy(rider, jobId);
    const updated = await this.move(jobId, J.ASSIGNED, J.ACCEPTED, 'RIDER', { where: { riderId: rider.id }, requestId });
    await this.announceRider(updated, rider);
    return updated;
  }

  /** The offered rider says no; the job goes to someone else. */
  async decline(rider: RiderContext, jobId: string, requestId?: string) {
    await this.assertHeldBy(rider, jobId);
    const updated = await this.giveBack(jobId, J.ASSIGNED, 'RIDER', rider.id, undefined, requestId);
    await this.scheduler.dispatch(jobId);
    return updated;
  }

  /** A rider who accepted but can't do it hands it back (before setting out). */
  async release(rider: RiderContext, jobId: string, reason: string, requestId?: string) {
    await this.assertHeldBy(rider, jobId);
    const updated = await this.giveBack(jobId, J.ACCEPTED, 'RIDER', rider.id, reason, requestId);
    await this.scheduler.dispatch(jobId);
    await this.ops.alert('A rider gave back an accepted job', `Order job ${jobId} was released by rider ${rider.id}: ${reason}`, { jobId });
    return updated;
  }

  /** Setting out. For a delivery this is the moment the order becomes OUT_FOR_DELIVERY and the customer gets their code. */
  async start(rider: RiderContext, jobId: string, requestId?: string) {
    const held = await this.assertHeldBy(rider, jobId);
    // Check the job first: moving the order for a job the rider has only been offered would leave them out of step.
    if (held.status !== J.ACCEPTED) {
      throw new AppException('JOB_INVALID_TRANSITION', `A ${held.status.toLowerCase()} job cannot be started.`, HttpStatus.CONFLICT, { status: held.status });
    }
    if (held.jobType === JobType.DROP && !held.isRedo) {
      await this.advanceOrder(held.orderId, ORDER_AFTER.DROP.start, rider, requestId);
    }
    const updated = await this.move(jobId, J.ACCEPTED, J.IN_TRANSIT, 'RIDER', { data: { startedAt: this.clock.now() }, where: { riderId: rider.id }, requestId });
    if (held.jobType === JobType.DROP) {
      await this.otp.issue(jobId, requestId).catch((err) => this.logger.error({ err, jobId }, 'Could not issue the delivery code'));
    }
    return updated;
  }

  /** Finishing the leg. A delivery needs proof: the customer's code, or a photo. */
  async complete(rider: RiderContext, jobId: string, dto: CompleteJobDto, requestId?: string) {
    const held = await this.assertHeldBy(rider, jobId);
    // Wrong state first: a code for a delivery that hasn't started is a different problem from a wrong code.
    if (held.status !== J.IN_TRANSIT) {
      throw new AppException('JOB_INVALID_TRANSITION', `A ${held.status.toLowerCase()} job cannot be completed.`, HttpStatus.CONFLICT, { status: held.status });
    }
    await this.limiter.consume(`rl:job-complete:${rider.id}`, 30, 600);

    let proof: Prisma.DeliveryJobUncheckedUpdateManyInput = {};
    if (held.jobType === JobType.DROP && !dto.otp && !dto.proofPhotoPublicId) {
      throw new AppException('PROOF_REQUIRED', "Enter the customer's delivery code or upload a photo as proof.", HttpStatus.BAD_REQUEST);
    }
    if (dto.proofPhotoPublicId) {
      const folder = uploadFolder(this.config.get('NODE_ENV', { infer: true }), 'proof', rider.userId, this.cloudinary.folderRoot);
      const photo = await this.cloudinary.verifyAsset(dto.proofPhotoPublicId, folder, 'authenticated');
      proof = { proofType: ProofType.PHOTO, proofPhotoUrl: photo.url, proofPhotoPublicId: photo.publicId };
    } else if (dto.otp) {
      if (held.jobType !== JobType.DROP) {
        throw new AppException('PROOF_NOT_NEEDED', 'A delivery code is only used when delivering to the customer.', HttpStatus.BAD_REQUEST);
      }
      await this.otp.verify(jobId, dto.otp);
      proof = { proofType: ProofType.OTP };
    }

    const finish = ORDER_AFTER[held.jobType].finish;
    const updated = await this.move(jobId, J.IN_TRANSIT, J.COMPLETED, 'RIDER', {
      data: { completedAt: this.clock.now(), proofOtpHash: null, ...proof },
      where: { riderId: rider.id },
      requestId,
    });
    if (!held.isRedo) await this.advanceOrder(held.orderId, finish, rider, requestId);
    return updated;
  }

  /** Couldn't do it (customer unreachable, address wrong ...). Ops decides what happens next. */
  async fail(rider: RiderContext, jobId: string, reason: string, requestId?: string) {
    const held = await this.assertHeldBy(rider, jobId);
    const updated = await this.move(jobId, [J.ACCEPTED, J.IN_TRANSIT], J.FAILED, 'RIDER', { data: { failureReason: reason }, where: { riderId: rider.id }, requestId });
    await this.ops.alert('A delivery job failed', `Order ${held.orderId} (${held.jobType}) failed: ${reason}`, { jobId, orderId: held.orderId });
    return updated;
  }

  // ───────────────────────── dispatch hooks (system) ─────────────────────────

  /** Offers an unassigned job to a rider. False if it was taken or changed in the meantime. */
  async offer(jobId: string, riderId: string): Promise<boolean> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockRider(tx, riderId);
        await this.assertCapacity(tx, riderId);
        await this.move(jobId, J.UNASSIGNED, J.ASSIGNED, 'SYSTEM', { data: { riderId, assignedAt: this.clock.now(), dispatchAttempts: { increment: 1 } }, where: { riderId: null } }, tx);
      });
      return true;
    } catch (err) {
      if (err instanceof AppException) return false;
      throw err;
    }
  }

  /** The offer was not accepted in time: the job returns to the pool and the rider is not asked again. */
  async expireOffer(jobId: string, riderId: string): Promise<boolean> {
    try {
      await this.giveBack(jobId, J.ASSIGNED, 'SYSTEM', riderId);
      return true;
    } catch (err) {
      if (err instanceof AppException) return false;
      throw err;
    }
  }

  /** A rider is leaving (suspended): hand back what they hold. Work already in transit is escalated to ops instead. */
  async releaseAllFor(riderId: string, reason: string, requestId?: string): Promise<void> {
    const held = await this.prisma.deliveryJob.findMany({ where: { riderId, status: { in: [J.ASSIGNED, J.ACCEPTED, J.IN_TRANSIT] } }, select: { id: true, status: true, orderId: true } });
    for (const job of held) {
      if (job.status === J.IN_TRANSIT) {
        await this.ops.alert('A suspended rider has a delivery in progress', `Order ${job.orderId}: ${reason}`, { jobId: job.id, riderId });
        continue;
      }
      try {
        await this.giveBack(job.id, job.status, 'ADMIN', riderId, reason, requestId);
        await this.scheduler.dispatch(job.id);
      } catch (err) {
        this.logger.warn({ err, jobId: job.id }, 'Could not release a suspended rider’s job');
      }
    }
  }

  // ───────────────────────── admin ─────────────────────────

  /**
   * Takes the job from its current rider. With `riderId`, gives it straight to that rider (force-assign: no offer, the
   * rider is told); without, puts it back in the pool for dispatch, skipping whoever had it.
   */
  async reassign(jobId: string, riderId: string | undefined, adminId: string, requestId?: string) {
    const job = await this.prisma.deliveryJob.findUnique({ where: { id: jobId }, include: { order: { select: { cityId: true, orderNo: true } } } });
    if (!job) throw this.notFound();
    if (!OPEN_JOB_STATUSES.includes(job.status)) {
      throw new AppException('JOB_INVALID_TRANSITION', `A ${job.status.toLowerCase()} job cannot be reassigned.`, HttpStatus.CONFLICT, { status: job.status });
    }
    let target: { id: string; userId: string } | null = null;
    if (riderId) {
      const rider = await this.prisma.rider.findUnique({ where: { id: riderId }, select: { id: true, userId: true, cityId: true, status: true } });
      if (!rider || rider.status !== 'APPROVED') {
        throw new AppException('RIDER_NOT_ACTIVE', 'That rider is not an approved rider.', HttpStatus.CONFLICT);
      }
      if (rider.cityId !== job.order.cityId) {
        throw new AppException('RIDER_WRONG_CITY', 'That rider works in a different city.', HttpStatus.CONFLICT);
      }
      target = rider;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (job.status !== J.UNASSIGNED) {
        await this.move(jobId, job.status, J.UNASSIGNED, 'ADMIN', {
          data: { riderId: null, assignedAt: null, startedAt: null, ...(job.riderId ? { declinedRiderIds: { push: job.riderId } } : {}), ...(job.status === J.FAILED ? { failureReason: null } : {}) },
          requestId,
        }, tx);
      }
      if (!target) return tx.deliveryJob.findUniqueOrThrow({ where: { id: jobId } });
      return this.move(jobId, J.UNASSIGNED, J.ACCEPTED, 'ADMIN', { data: { riderId: target.id, assignedAt: this.clock.now() }, where: { riderId: null }, requestId }, tx);
    });

    await this.audit('JOB_REASSIGNED', jobId, adminId, { from: job.riderId, to: target?.id ?? null }, requestId);
    if (job.riderId && job.riderId !== target?.id) await this.tellRider(job.riderId, 'rider_job_cancelled', job.order.orderNo, job.jobType, { reason: 'An admin reassigned it.' }, jobId);
    if (target) {
      await this.tellRider(target.id, 'rider_job_assigned', job.order.orderNo, job.jobType, {}, jobId);
    } else {
      await this.scheduler.dispatch(jobId);
    }
    return updated;
  }

  /** Admin marks a job as failed (nobody can do it, customer gone ...). */
  async markFailed(jobId: string, reason: string, adminId: string, requestId?: string) {
    const job = await this.prisma.deliveryJob.findUnique({ where: { id: jobId }, select: { status: true, riderId: true } });
    if (!job) throw this.notFound();
    const updated = await this.move(jobId, job.status, J.FAILED, 'ADMIN', { data: { failureReason: reason }, requestId });
    await this.audit('JOB_MARKED_FAILED', jobId, adminId, { reason }, requestId);
    return updated;
  }

  /** Sends a failed (or stuck) job back out to dispatch from scratch. */
  async redispatch(jobId: string, adminId: string, requestId?: string) {
    const job = await this.prisma.deliveryJob.findUnique({ where: { id: jobId }, select: { status: true, riderId: true } });
    if (!job) throw this.notFound();
    let updated: DeliveryJob;
    if (job.status === J.UNASSIGNED) {
      updated = await this.prisma.deliveryJob.update({ where: { id: jobId }, data: { dispatchAttempts: 0, unassignedAlertedAt: null } });
    } else {
      updated = await this.move(jobId, job.status, J.UNASSIGNED, 'ADMIN', {
        data: { riderId: null, assignedAt: null, startedAt: null, failureReason: null, dispatchAttempts: 0, unassignedAlertedAt: null },
        requestId,
      });
    }
    await this.audit('JOB_REDISPATCHED', jobId, adminId, { from: job.status }, requestId);
    await this.scheduler.dispatch(jobId);
    return updated;
  }

  // ───────────────────────── partner (courier) hooks ─────────────────────────

  /** A courier partner took the job. */
  assignToPartner(jobId: string, partnerId: string, partnerRef: string) {
    return this.move(jobId, J.UNASSIGNED, J.ACCEPTED, 'PARTNER', { data: { partnerId, partnerRef, assignedAt: this.clock.now() }, where: { riderId: null } });
  }

  /** A status the courier reported. Mirrors what a rider would do: set out, finish, or fail. */
  async applyPartnerProgress(job: DeliveryJob, to: 'IN_TRANSIT' | 'COMPLETED' | 'FAILED', reason?: string): Promise<void> {
    if (to === 'IN_TRANSIT') {
      if (job.jobType === JobType.DROP && !job.isRedo) await this.advanceOrder(job.orderId, ORDER_AFTER.DROP.start, null);
      await this.move(job.id, J.ACCEPTED, J.IN_TRANSIT, 'PARTNER', { data: { startedAt: this.clock.now() } });
    } else if (to === 'COMPLETED') {
      // A partner can report "delivered" without a separate "on the way".
      if (job.status === J.ACCEPTED) await this.applyPartnerProgress(job, 'IN_TRANSIT');
      await this.move(job.id, J.IN_TRANSIT, J.COMPLETED, 'PARTNER', { data: { completedAt: this.clock.now() } });
      if (!job.isRedo) await this.advanceOrder(job.orderId, ORDER_AFTER[job.jobType].finish, null);
    } else {
      await this.move(job.id, [J.ACCEPTED, J.IN_TRANSIT], J.FAILED, 'PARTNER', { data: { failureReason: reason ?? 'The courier could not complete it.' } });
      await this.ops.alert('A courier partner job failed', `Order ${job.orderId} (${job.jobType}): ${reason ?? 'no reason given'}`, { jobId: job.id });
    }
  }

  // ───────────────────────── internals ─────────────────────────

  /**
   * Compare-and-set a job from one of `from` to `to`. The state machine decides whether the move is legal for this
   * actor; the update only matches while the row is still in `from` (and still meets `where`), so a concurrent change
   * makes it fail rather than overwrite.
   */
  async move(jobId: string, from: JobStatus | JobStatus[], to: JobStatus, actor: JobActor, opts: MoveOptions = {}, db: Prisma.TransactionClient | PrismaService = this.prisma): Promise<DeliveryJob> {
    const froms = Array.isArray(from) ? from : [from];
    for (const f of froms) {
      if (!canMoveJob(f, to, actor)) {
        throw new AppException('JOB_INVALID_TRANSITION', `A ${f.toLowerCase()} job cannot become ${to.toLowerCase()}.`, HttpStatus.CONFLICT, { from: f, to });
      }
    }
    const claimed = await db.deliveryJob.updateMany({
      where: { id: jobId, status: { in: froms }, ...(opts.where ?? {}) },
      data: { ...(opts.data ?? {}), status: to },
    });
    if (claimed.count !== 1) {
      if (opts.conflict) throw opts.conflict;
      const current = await db.deliveryJob.findUnique({ where: { id: jobId }, select: { status: true } });
      if (!current) throw this.notFound();
      throw new AppException('JOB_INVALID_TRANSITION', `This job is ${current.status.toLowerCase()} now, so it cannot become ${to.toLowerCase()}.`, HttpStatus.CONFLICT, {
        status: current.status,
      });
    }
    const job = await db.deliveryJob.findUniqueOrThrow({ where: { id: jobId } });
    this.emitChange(job, froms[0], actor);
    return job;
  }

  /** Returns a job to the pool and remembers who passed on it, so dispatch never offers it to them again. */
  private giveBack(jobId: string, from: JobStatus, actor: JobActor, riderId: string, reason?: string, requestId?: string) {
    return this.move(jobId, from, J.UNASSIGNED, actor, {
      data: { riderId: null, assignedAt: null, declinedRiderIds: { push: riderId }, ...(reason ? { failureReason: reason } : {}) },
      where: { riderId },
      requestId,
    });
  }

  /** The job must exist and belong to this rider; anyone else's job simply isn't found. */
  private async assertHeldBy(rider: RiderContext, jobId: string) {
    const job = await this.prisma.deliveryJob.findUnique({ where: { id: jobId } });
    if (!job || job.riderId !== rider.id) throw this.notFound();
    return job;
  }

  private async lockRider(tx: Prisma.TransactionClient, riderId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'rider:' + riderId}))`;
  }

  private async assertCapacity(tx: Prisma.TransactionClient, riderId: string): Promise<void> {
    const max = this.config.get('RIDER_MAX_ACTIVE_JOBS', { infer: true });
    const active = await tx.deliveryJob.count({ where: { riderId, status: { in: [J.ASSIGNED, J.ACCEPTED, J.IN_TRANSIT] } } });
    if (active >= max) throw new AppException('RIDER_BUSY', `You already have ${max} active jobs. Finish one first.`, HttpStatus.CONFLICT, { max });
  }

  /**
   * Moves the order forward as the job does. If the order is already there (retry, or someone else got there first)
   * that counts as done; anything else illegal surfaces as the order's own error.
   */
  private async advanceOrder(orderId: string, to: OrderStatus, rider: RiderContext | null, requestId?: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
    if (!order) throw this.notFound();
    if (order.status === to) return;
    await this.lifecycle.transition(orderId, to, { kind: 'RIDER', userId: rider?.userId, role: Role.RIDER }, { requestId });
  }

  /** Tells the customer who is coming. */
  private async announceRider(job: DeliveryJob, rider: RiderContext): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: job.orderId }, select: { orderNo: true, customerId: true } });
    if (!order) return;
    await this.notifier.notifyUser(
      order.customerId,
      'order_rider_assigned',
      { orderNo: order.orderNo, rider: rider.name ?? 'Your rider', jobType: jobWord(job.jobType) },
      { orderId: job.orderId, jobId: job.id, type: 'RIDER_ASSIGNED' },
    );
  }

  private async tellRider(riderId: string, template: 'rider_job_assigned' | 'rider_job_cancelled', orderNo: string, type: JobType, extra: { reason?: string }, jobId: string): Promise<void> {
    const rider = await this.prisma.rider.findUnique({ where: { id: riderId }, select: { userId: true } });
    if (!rider) return;
    await this.notifier.notifyUser(rider.userId, template, { orderNo, jobType: jobWord(type), ...extra }, { jobId, type: template.toUpperCase() });
  }

  private emitChange(job: DeliveryJob, from: JobStatus, actor: JobActor): void {
    this.events.emit(DomainEvent.DELIVERY_JOB_CHANGED, {
      jobId: job.id,
      orderId: job.orderId,
      jobType: job.jobType,
      from,
      to: job.status,
      riderId: job.riderId,
      actor,
      at: this.clock.now().toISOString(),
    } satisfies DeliveryJobChangedEvent);
  }

  private async audit(action: string, jobId: string, adminId: string, after: Prisma.InputJsonObject, requestId?: string): Promise<void> {
    await this.prisma.auditLog.create({ data: { action, entity: 'DeliveryJob', entityId: jobId, actorId: adminId, actorRole: Role.ADMIN, after, requestId } }).catch((err) =>
      this.logger.error({ err, action, jobId }, 'Could not write the audit entry'),
    );
  }

  private notFound(): AppException {
    return new AppException(ErrorCode.NOT_FOUND, 'Delivery job not found.', HttpStatus.NOT_FOUND);
  }
}
