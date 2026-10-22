import { randomInt } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma, Role, User, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import Redis from 'ioredis';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RateLimiter } from '../../infra/redis/rate-limiter.service';
import { REDIS } from '../../infra/redis/redis.constants';
import { AdminLoginDto, RequestOtpDto, VerifyOtpDto } from './dto/auth.dto';
import { OtpService } from './otp.service';
import { normalizePkMobile } from './phone.util';
import { IssuedTokens, SessionContext, TokenService } from './token.service';

export const ADMIN_LOCKOUT = { maxFailures: 5, windowSec: 900 } as const;
const ADMIN_LOGIN_PER_IP = { limit: 20, windowSec: 600 } as const;
const REFERRAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const lockKey = (email: string) => `lock:admin:${email}`;

export interface AuthResult {
  tokens: IssuedTokens;
  user: PublicUser;
  isNewUser: boolean;
}

export type PublicUser = Pick<User, 'id' | 'phone' | 'name' | 'email' | 'role' | 'locale' | 'referralCode'>;

export const toPublicUser = (u: User): PublicUser => ({
  id: u.id,
  phone: u.phone,
  name: u.name,
  email: u.email,
  role: u.role,
  locale: u.locale,
  referralCode: u.referralCode,
});

@Injectable()
export class AuthService {
  /** Verified against when the email is unknown, so response time doesn't reveal which emails exist. */
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly limiter: RateLimiter,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async requestOtp(dto: RequestOtpDto, ctx: SessionContext & { requestId?: string }) {
    const phone = this.requirePhone(dto.phone);
    return this.otp.request(phone, ctx.ip ?? 'unknown', ctx.requestId);
  }

  async verifyOtp(dto: VerifyOtpDto, ctx: SessionContext): Promise<AuthResult> {
    const phone = this.requirePhone(dto.phone);
    await this.otp.verify(phone, dto.code, ctx.ip ?? 'unknown');

    const { user, isNew } = await this.findOrCreateUser(phone, dto.role ?? Role.CUSTOMER);
    // Admins sign in with email + password only; a phone code never opens an admin account.
    if (user.role === Role.ADMIN) {
      throw new AppException(ErrorCode.UNAUTHENTICATED, 'Please sign in again.', HttpStatus.UNAUTHORIZED);
    }
    this.assertActive(user);

    const loggedIn = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), phoneVerifiedAt: user.phoneVerifiedAt ?? new Date() },
    });
    return { tokens: await this.tokens.issue(loggedIn, ctx), user: toPublicUser(loggedIn), isNewUser: isNew };
  }

  async adminLogin(dto: AdminLoginDto, ctx: SessionContext): Promise<AuthResult> {
    await this.limiter.consume(`rl:admin-login:ip:${ctx.ip ?? 'unknown'}`, ADMIN_LOGIN_PER_IP.limit, ADMIN_LOGIN_PER_IP.windowSec);

    const key = lockKey(dto.email);
    const failures = Number((await this.redis.get(key)) ?? 0);
    if (failures >= ADMIN_LOCKOUT.maxFailures) {
      throw new AppException('ACCOUNT_LOCKED', 'Too many failed sign-ins. Try again later.', HttpStatus.TOO_MANY_REQUESTS, {
        retryAfterSec: await this.redis.ttl(key),
      });
    }

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const hash = user?.role === Role.ADMIN ? user.passwordHash : null;
    const valid = hash ? await argon2.verify(hash, dto.password) : await this.burnVerifyTime(dto.password);

    if (!valid || !user) {
      const n = await this.redis.incr(key);
      if (n === 1) await this.redis.expire(key, ADMIN_LOCKOUT.windowSec);
      throw new AppException('INVALID_CREDENTIALS', 'Incorrect email or password.', HttpStatus.UNAUTHORIZED);
    }

    await this.redis.del(key);
    this.assertActive(user);
    const loggedIn = await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { tokens: await this.tokens.issue(loggedIn, ctx), user: toPublicUser(loggedIn), isNewUser: false };
  }

  async refresh(rawRefreshToken: string | undefined, ctx: SessionContext): Promise<AuthResult> {
    if (!rawRefreshToken) {
      throw new AppException(ErrorCode.UNAUTHENTICATED, 'Please sign in again.', HttpStatus.UNAUTHORIZED);
    }
    const { tokens, user } = await this.tokens.rotate(rawRefreshToken, ctx);
    return { tokens, user: toPublicUser(user), isNewUser: false };
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (rawRefreshToken) await this.tokens.revokeByRefreshToken(rawRefreshToken);
  }

  private requirePhone(input: string): string {
    const phone = normalizePkMobile(input);
    if (!phone) {
      throw new AppException('INVALID_PHONE', 'Enter a valid Pakistani mobile number.', HttpStatus.BAD_REQUEST);
    }
    return phone;
  }

  private assertActive(user: Pick<User, 'status'>): void {
    if (user.status !== UserStatus.ACTIVE) {
      throw new AppException('ACCOUNT_SUSPENDED', 'This account is not active.', HttpStatus.FORBIDDEN);
    }
  }

  private async burnVerifyTime(password: string): Promise<false> {
    this.dummyHash ??= argon2.hash('dhoblio-dummy-password', { type: argon2.argon2id });
    await argon2.verify(await this.dummyHash, password);
    return false;
  }

  /** First login creates the account (with a referral code); later logins keep the existing role. */
  private async findOrCreateUser(phone: string, role: Role): Promise<{ user: User; isNew: boolean }> {
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing) return { user: existing, isNew: false };

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const user = await this.prisma.user.create({
          data: { phone, role, referralCode: generateReferralCode(), phoneVerifiedAt: new Date() },
        });
        return { user, isNew: true };
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err;
        // Either a concurrent first login for this phone won the race, or the referral code collided: retry.
        const raced = await this.prisma.user.findUnique({ where: { phone } });
        if (raced) return { user: raced, isNew: false };
      }
    }
    throw new AppException(ErrorCode.INTERNAL, 'Could not create account', HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

export function generateReferralCode(length = 8): string {
  let code = '';
  for (let i = 0; i < length; i++) code += REFERRAL_ALPHABET[randomInt(REFERRAL_ALPHABET.length)];
  return code;
}
