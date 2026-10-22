import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobStatus, JobType } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import type { Env } from '../../config/env';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RateLimiter } from '../../infra/redis/rate-limiter.service';
import { DeliveryOtpService } from './delivery-otp.service';
import { RiderPresenceService } from './rider-presence.service';

/** The customer's side of delivery: who is bringing my order, where are they, and the delivery code. */
@Injectable()
export class OrderDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: RiderPresenceService,
    private readonly otp: DeliveryOtpService,
    private readonly limiter: RateLimiter,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Pickup and delivery legs with the rider's name and photo (never contact details). */
  async legs(orderId: string) {
    const jobs = await this.prisma.deliveryJob.findMany({
      where: { orderId, status: { not: JobStatus.CANCELLED } },
      orderBy: { jobType: 'asc' },
      select: {
        id: true,
        jobType: true,
        status: true,
        scheduledStart: true,
        scheduledEnd: true,
        startedAt: true,
        completedAt: true,
        partnerId: true,
        rider: { select: { photoUrl: true, user: { select: { name: true } } } },
      },
    });
    return jobs.map(({ rider, partnerId, ...j }) => ({
      ...j,
      handledBy: partnerId ? 'COURIER_PARTNER' : rider ? 'RIDER' : null,
      rider: rider ? { name: rider.user.name, photoUrl: rider.photoUrl } : null,
    }));
  }

  /** Live position of the rider on their way to this customer (FE-5.7). Only while a leg is in transit, and only if enabled. */
  async riderLocation(orderId: string) {
    if (!this.config.get('RIDER_TRACKING_ENABLED', { infer: true })) {
      throw new AppException('TRACKING_DISABLED', 'Live rider tracking is turned off.', HttpStatus.NOT_FOUND);
    }
    const job = await this.prisma.deliveryJob.findFirst({ where: { orderId, status: JobStatus.IN_TRANSIT, riderId: { not: null } }, select: { riderId: true, jobType: true } });
    const position = job?.riderId ? await this.presence.position(job.riderId) : null;
    if (!job || !position) throw new AppException(ErrorCode.NOT_FOUND, 'The rider is not on the way right now.', HttpStatus.NOT_FOUND);
    return { jobType: job.jobType, lat: position.lat, lng: position.lng, updatedAt: position.at };
  }

  /** Sends the customer a fresh delivery code (the old one stops working). Limited, so it can't be used to spam. */
  async resendCode(orderId: string, customerId: string, requestId?: string) {
    await this.limiter.consume(`rl:delivery-code:order:${orderId}`, 3, 3600);
    const job = await this.prisma.deliveryJob.findFirst({
      where: { orderId, jobType: JobType.DROP, status: JobStatus.IN_TRANSIT, order: { customerId } },
      select: { id: true },
    });
    if (!job) throw new AppException('NO_DELIVERY_IN_PROGRESS', 'Your order is not out for delivery right now.', HttpStatus.CONFLICT);
    await this.otp.issue(job.id, requestId);
    return { sent: true };
  }
}
