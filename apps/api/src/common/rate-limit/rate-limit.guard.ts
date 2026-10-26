import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Env } from '../../config/env';
import { RateLimiter } from '../../infra/redis/rate-limiter.service';
import type { AuthedRequest } from '../auth/auth-user';
import { RATE_LIMIT_KEY, RateLimitOptions } from './rate-limit.decorator';

/** Health probes are hit constantly by load balancers and must never be limited. */
const EXEMPT_PREFIXES = ['/api/v1/health'];
const DEFAULT_WINDOW_SEC = 60;

/**
 * Two layers (BE-9.1). Every request counts against a generous per-caller backstop (signed-in user, else IP), so
 * a runaway client or a scraper cannot hammer any route. Routes marked @RateLimit also count against their own,
 * stricter limit. Runs after authentication, so the signed-in user is known.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimiter,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const path = req.path ?? req.url ?? '';
    if (EXEMPT_PREFIXES.some((p) => path.startsWith(p))) return true;

    const ip = req.ip ?? 'unknown';
    const who = req.user?.id ? `user:${req.user.id}` : `ip:${ip}`;

    const backstop = this.config.get('RATE_LIMIT_DEFAULT_PER_MIN', { infer: true });
    if (backstop > 0) await this.consume(`rl:all:${who}`, backstop, DEFAULT_WINDOW_SEC, 'all');

    const own = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [context.getHandler(), context.getClass()]);
    if (own) {
      const subject = own.by === 'ip' ? `ip:${ip}` : who;
      await this.consume(`rl:${own.name}:${subject}`, own.limit, own.windowSec, own.name);
    }
    return true;
  }

  private async consume(key: string, limit: number, windowSec: number, name: string): Promise<void> {
    try {
      await this.limiter.consume(key, limit, windowSec);
    } catch (err) {
      if ((err as { code?: string }).code === 'RATE_LIMITED') this.logger.warn({ limit: name }, 'Request rate-limited');
      throw err;
    }
  }
}

