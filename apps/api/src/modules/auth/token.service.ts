import { createHash, randomBytes } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, Session, User, UserStatus } from '@prisma/client';
import Redis from 'ioredis';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import type { Env } from '../../config/env';
import { ttlToSeconds } from '../../config/ttl';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { REDIS } from '../../infra/redis/redis.constants';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  sid: string;
}

export interface SessionContext {
  ip?: string;
  userAgent?: string;
}

export interface IssuedTokens {
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export const denyKey = (sessionId: string) => `deny:${sessionId}`;
export const hashRefreshToken = (raw: string) => createHash('sha256').update(raw).digest('hex');

type TokenUser = Pick<User, 'id' | 'role' | 'status'>;

@Injectable()
export class TokenService {
  private readonly accessSecret: string;
  private readonly accessTtlSec: number;
  private readonly refreshTtlDays: number;

  constructor(
    config: ConfigService<Env, true>,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {
    this.accessSecret = config.get('JWT_ACCESS_SECRET', { infer: true });
    this.accessTtlSec = ttlToSeconds(config.get('JWT_ACCESS_TTL', { infer: true }));
    this.refreshTtlDays = config.get('JWT_REFRESH_TTL_DAYS', { infer: true });
  }

  /** Starts a new login (new session family). */
  issue(user: TokenUser, ctx: SessionContext): Promise<IssuedTokens> {
    return this.createSession(user, ctx);
  }

  /**
   * Rotates a refresh token. A token that was already rotated (or revoked) being presented again means it leaked:
   * the whole family is revoked and the caller must log in again.
   */
  async rotate(rawRefreshToken: string, ctx: SessionContext): Promise<{ tokens: IssuedTokens; user: User }> {
    const session = await this.prisma.session.findUnique({
      where: { refreshHash: hashRefreshToken(rawRefreshToken) },
      include: { user: true },
    });
    if (!session) throw this.unauthenticated();

    if (session.revokedAt) {
      await this.revokeFamily(session.familyId);
      throw this.unauthenticated();
    }
    if (session.expiresAt <= new Date()) throw this.unauthenticated();
    if (session.user.status !== UserStatus.ACTIVE) {
      throw new AppException('ACCOUNT_SUSPENDED', 'This account is not active.', HttpStatus.FORBIDDEN);
    }

    // Conditional update: of two concurrent refreshes with the same token only one wins the rotation.
    const claimed = await this.prisma.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count !== 1) {
      await this.revokeFamily(session.familyId);
      throw this.unauthenticated();
    }

    const tokens = await this.createSession(session.user, ctx, session.familyId);
    return { tokens, user: session.user };
  }

  /** Logout: revoke the whole family so every access token minted from this login dies too. */
  async revokeByRefreshToken(rawRefreshToken: string): Promise<void> {
    const session = await this.prisma.session.findUnique({ where: { refreshHash: hashRefreshToken(rawRefreshToken) } });
    if (session) await this.revokeFamily(session.familyId);
  }

  async revokeFamily(familyId: string): Promise<void> {
    const now = new Date();
    const sessions = await this.prisma.session.findMany({ where: { familyId }, select: { id: true } });
    await this.prisma.session.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: now } });
    if (sessions.length > 0) {
      const pipeline = this.redis.multi();
      for (const s of sessions) pipeline.set(denyKey(s.id), '1', 'EX', this.accessTtlSec);
      await pipeline.exec();
    }
  }

  /** Revoke every login of a user, e.g. on suspension. */
  async revokeAllForUser(userId: string): Promise<void> {
    const families = await this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      select: { familyId: true },
      distinct: ['familyId'],
    });
    for (const f of families) await this.revokeFamily(f.familyId);
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.jwt.verifyAsync<AccessTokenPayload>(token, { secret: this.accessSecret, algorithms: ['HS256'] });
  }

  isSessionDenied(sessionId: string): Promise<boolean> {
    return this.redis.exists(denyKey(sessionId)).then((n) => n === 1);
  }

  private async createSession(user: TokenUser, ctx: SessionContext, familyId?: string): Promise<IssuedTokens> {
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + this.refreshTtlDays * 86_400_000);

    const session: Session = await this.prisma.session.create({
      data: {
        userId: user.id,
        ...(familyId ? { familyId } : {}),
        refreshHash: hashRefreshToken(refreshToken),
        deviceInfo: ctx.userAgent?.slice(0, 200),
        ip: ctx.ip,
        expiresAt: refreshExpiresAt,
      },
    });

    const payload: AccessTokenPayload = { sub: user.id, role: user.role, sid: session.id };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.accessSecret,
      algorithm: 'HS256',
      expiresIn: this.accessTtlSec,
    });

    return { accessToken, expiresIn: this.accessTtlSec, refreshToken, refreshExpiresAt };
  }

  private unauthenticated(): AppException {
    return new AppException(ErrorCode.UNAUTHENTICATED, 'Please sign in again.', HttpStatus.UNAUTHORIZED);
  }
}
