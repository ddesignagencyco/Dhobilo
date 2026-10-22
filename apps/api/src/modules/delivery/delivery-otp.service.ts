import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt, timingSafeEqual } from 'node:crypto';
import { FieldCrypto } from '../../common/crypto/field-crypto';
import { AppException } from '../../common/errors/app.exception';
import { Clock } from '../../common/time/clock';
import type { Env } from '../../config/env';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { NotificationOrchestrator } from '../notifications/notification-orchestrator';

/**
 * The 4-digit code a customer reads out to the rider as proof of delivery (FR-R5). Only a keyed hash is stored; the
 * code itself exists in the message to the customer and nowhere else. Guessing is capped: a job accepts a limited
 * number of tries, after which the rider must use a proof photo or ask support.
 */
@Injectable()
export class DeliveryOtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: FieldCrypto,
    private readonly config: ConfigService<Env, true>,
    private readonly clock: Clock,
    private readonly notifier: NotificationOrchestrator,
  ) {}

  private hash(jobId: string, code: string): string {
    return this.crypto.hash('delivery-otp', `${jobId}:${code}`);
  }

  /** Creates a fresh code for a drop job, stores its hash, and sends the code to the customer. */
  async issue(jobId: string, requestId?: string): Promise<void> {
    const code = String(randomInt(0, 10_000)).padStart(4, '0');
    const ttlHours = this.config.get('DELIVERY_OTP_TTL_HOURS', { infer: true });
    const job = await this.prisma.deliveryJob.update({
      where: { id: jobId },
      data: {
        proofOtpHash: this.hash(jobId, code),
        proofOtpExpiresAt: new Date(this.clock.now().getTime() + ttlHours * 3_600_000),
        proofOtpAttempts: 0,
      },
      select: { order: { select: { id: true, orderNo: true, customerId: true } } },
    });
    await this.notifier.notifyUser(
      job.order.customerId,
      'delivery_code',
      { orderNo: job.order.orderNo, code },
      { orderId: job.order.id, type: 'DELIVERY_CODE' },
      { push: true, text: true, email: false },
      requestId,
    );
  }

  /** Throws unless `code` is the live code for this job. Every call counts as an attempt, right or wrong. */
  async verify(jobId: string, code: string): Promise<void> {
    const max = this.config.get('DELIVERY_OTP_MAX_ATTEMPTS', { infer: true });
    // Count the attempt first, atomically, so parallel guesses can't squeeze past the limit.
    const counted = await this.prisma.deliveryJob.updateMany({
      where: { id: jobId, proofOtpHash: { not: null }, proofOtpAttempts: { lt: max } },
      data: { proofOtpAttempts: { increment: 1 } },
    });
    const job = await this.prisma.deliveryJob.findUnique({
      where: { id: jobId },
      select: { proofOtpHash: true, proofOtpExpiresAt: true, proofOtpAttempts: true },
    });
    if (!job?.proofOtpHash) {
      throw new AppException('DELIVERY_OTP_NOT_ISSUED', 'No delivery code has been sent for this job yet.', HttpStatus.CONFLICT);
    }
    if (counted.count === 0) {
      throw new AppException(
        'DELIVERY_OTP_LOCKED',
        'Too many wrong codes. Use a proof photo, or ask support.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (job.proofOtpExpiresAt && job.proofOtpExpiresAt.getTime() < this.clock.now().getTime()) {
      throw new AppException('DELIVERY_OTP_EXPIRED', 'This delivery code has expired. Ask the customer to request a new one.', HttpStatus.BAD_REQUEST);
    }
    const given = Buffer.from(this.hash(jobId, code));
    const expected = Buffer.from(job.proofOtpHash);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new AppException('INVALID_DELIVERY_OTP', 'That code is not right.', HttpStatus.BAD_REQUEST, {
        attemptsLeft: Math.max(max - job.proofOtpAttempts, 0),
      });
    }
  }
}
