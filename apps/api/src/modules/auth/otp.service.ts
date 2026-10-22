import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpPurpose } from '@prisma/client';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { AppException } from '../../common/errors/app.exception';
import type { Env } from '../../config/env';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { QUEUES } from '../../infra/queue/queues';
import { RateLimiter } from '../../infra/redis/rate-limiter.service';
import { REDIS } from '../../infra/redis/redis.constants';
import { SEND_SMS_JOB } from '../notifications/notifications.processor';

export const OTP_LIMITS = {
  requestPerPhone: { limit: 3, windowSec: 600 },
  requestPerIp: { limit: 10, windowSec: 3600 },
  verifyPerIp: { limit: 30, windowSec: 600 },
  maxVerifyAttempts: 5,
} as const;

export const BYPASS_CODE = '123456';
export const otpKey = (phone: string) => `otp:${phone}`;

/** HMAC (not a bare hash): a leaked Redis snapshot can't be brute-forced offline over the 10^6 code space. */
export function hashOtp(phone: string, code: string, key: Buffer): string {
  return createHmac('sha256', key).update(`${phone}:${code}`).digest('hex');
}

@Injectable()
export class OtpService {
  private readonly hmacKey: Buffer;
  private readonly ttlSeconds: number;
  private readonly bypass: boolean;

  constructor(
    config: ConfigService<Env, true>,
    @Inject(REDIS) private readonly redis: Redis,
    @InjectQueue(QUEUES.NOTIFICATIONS) private readonly notifications: Queue,
    private readonly limiter: RateLimiter,
    private readonly prisma: PrismaService,
  ) {
    this.hmacKey = Buffer.from(String(config.get('HMAC_KEY_BASE64', { infer: true })), 'base64');
    this.ttlSeconds = config.get('OTP_TTL_SECONDS', { infer: true });
    this.bypass = config.get('OTP_BYPASS', { infer: true }) && config.get('NODE_ENV', { infer: true }) !== 'production';
  }

  /** Issues a code for `phone` (already E.164). Returns how long it stays valid. */
  async request(phone: string, ip: string, requestId?: string): Promise<{ expiresInSeconds: number }> {
    await this.limiter.consume(`rl:otp-req:ip:${ip}`, OTP_LIMITS.requestPerIp.limit, OTP_LIMITS.requestPerIp.windowSec);
    await this.limiter.consume(
      `rl:otp-req:phone:${phone}`,
      OTP_LIMITS.requestPerPhone.limit,
      OTP_LIMITS.requestPerPhone.windowSec,
    );

    const code = this.bypass ? BYPASS_CODE : String(randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = hashOtp(phone, code, this.hmacKey);
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);

    // Durable audit copy (hash only); Redis is the hot path.
    const row = await this.prisma.otpCode.create({
      data: { phone, purpose: OtpPurpose.LOGIN, codeHash, expiresAt },
      select: { id: true },
    });

    const key = otpKey(phone);
    await this.redis.multi().del(key).hset(key, { hash: codeHash, attempts: 0, id: row.id }).expire(key, this.ttlSeconds).exec();

    if (!this.bypass) {
      await this.notifications.add(
        SEND_SMS_JOB,
        {
          to: phone,
          message: `Your Dhoblio code is ${code}. It expires in ${Math.round(this.ttlSeconds / 60)} minutes. Do not share it.`,
          requestId,
        },
        // The payload holds the plaintext code: never keep it around after delivery.
        { removeOnComplete: true, removeOnFail: { age: this.ttlSeconds } },
      );
    }

    return { expiresInSeconds: this.ttlSeconds };
  }

  /** Throws unless `code` is the live code for `phone`. A code works once. */
  async verify(phone: string, code: string, ip: string): Promise<void> {
    await this.limiter.consume(`rl:otp-verify:ip:${ip}`, OTP_LIMITS.verifyPerIp.limit, OTP_LIMITS.verifyPerIp.windowSec);

    const key = otpKey(phone);
    const stored = await this.redis.hgetall(key);
    if (!stored.hash) throw this.invalid();

    const attempts = await this.redis.hincrby(key, 'attempts', 1);
    if (attempts > OTP_LIMITS.maxVerifyAttempts) {
      await this.redis.del(key);
      throw new AppException(
        'OTP_TOO_MANY_ATTEMPTS',
        'Too many wrong codes. Request a new code.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const given = Buffer.from(hashOtp(phone, code, this.hmacKey), 'hex');
    const expected = Buffer.from(stored.hash, 'hex');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      if (attempts >= OTP_LIMITS.maxVerifyAttempts) await this.redis.del(key);
      throw this.invalid();
    }

    // DEL returning 1 means this request consumed the code; a concurrent duplicate gets 0 and fails.
    if ((await this.redis.del(key)) !== 1) throw this.invalid();

    if (stored.id) {
      await this.prisma.otpCode.updateMany({ where: { id: stored.id }, data: { consumedAt: new Date(), attempts } });
    }
  }

  private invalid(): AppException {
    return new AppException('INVALID_OTP', 'The code is invalid or has expired.', HttpStatus.BAD_REQUEST);
  }
}
