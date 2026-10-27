import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { AdminArea, adminMayAccess } from '../../../common/auth/admin-permissions';
import { AuthedRequest } from '../../../common/auth/auth-user';
import { ADMIN_AREA_KEY } from '../../../common/decorators/admin-area.decorator';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!roles || roles.length === 0) return true;

    const user = context.switchToHttp().getRequest<AuthedRequest>().user;
    if (!user || !roles.includes(user.role)) {
      throw new AppException(ErrorCode.FORBIDDEN, 'You do not have access to this resource.', HttpStatus.FORBIDDEN);
    }
    if (user.role === Role.ADMIN) {
      const area = this.reflector.getAllAndOverride<AdminArea | undefined>(ADMIN_AREA_KEY, [context.getHandler(), context.getClass()]);
      if (!adminMayAccess(user.adminRole, area)) {
        throw new AppException(ErrorCode.FORBIDDEN, 'Your admin role does not allow this.', HttpStatus.FORBIDDEN);
      }
    }
    return true;
  }
}
