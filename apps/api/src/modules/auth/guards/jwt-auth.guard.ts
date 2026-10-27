import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserStatus } from '@prisma/client';
import { AuthedRequest } from '../../../common/auth/auth-user';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { TokenService } from '../token.service';

/**
 * Global guard: every route needs a valid access token unless marked @Public().
 * Role and status are read from the DB on each request, so a suspension or role change applies immediately.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
    if (!token) throw this.unauthenticated();

    let payload;
    try {
      payload = await this.tokens.verifyAccessToken(token);
    } catch {
      throw this.unauthenticated();
    }
    if (await this.tokens.isSessionDenied(payload.sid)) throw this.unauthenticated();

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, adminRole: true, status: true },
    });
    if (!user) throw this.unauthenticated();
    if (user.status !== UserStatus.ACTIVE) {
      throw new AppException('ACCOUNT_SUSPENDED', 'This account is not active.', HttpStatus.FORBIDDEN);
    }

    req.user = { id: user.id, role: user.role, adminRole: user.adminRole, sessionId: payload.sid };
    return true;
  }

  private unauthenticated(): AppException {
    return new AppException(ErrorCode.UNAUTHENTICATED, 'Authentication required.', HttpStatus.UNAUTHORIZED);
  }
}
