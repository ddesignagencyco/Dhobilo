import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { AuthedRequest } from '../../../common/auth/auth-user';
import { OWNED_BY_KEY, OwnedByMetadata, OwnershipResolver } from '../../../common/decorators/owned-by.decorator';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';

/**
 * Applies to handlers marked @OwnedBy(Resolver). Non-owners get 404 (not 403) so resource ids can't be probed.
 * Admins pass; their access is audited at the handler level.
 */
@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly moduleRef: ModuleRef,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const meta = this.reflector.get<OwnedByMetadata | undefined>(OWNED_BY_KEY, context.getHandler());
    if (!meta) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const user = req.user;
    if (!user) throw new AppException(ErrorCode.UNAUTHENTICATED, 'Authentication required.', HttpStatus.UNAUTHORIZED);
    if (user.role === Role.ADMIN) return true;

    const resourceId = req.params?.[meta.param];
    const resolver = this.moduleRef.get<OwnershipResolver>(meta.resolver, { strict: false });
    const allowed = resourceId ? await resolver.allowedUserIds(String(resourceId), user) : null;
    if (!allowed || !allowed.includes(user.id)) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Resource not found.', HttpStatus.NOT_FOUND);
    }
    return true;
  }
}
