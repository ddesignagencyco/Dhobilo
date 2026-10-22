import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import type { AuthedRequest } from '../../common/auth/auth-user';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { OrderAccessService } from './order-access.service';

/**
 * Route guard: only the customer, the vendor's people and admins may open `:id`; everyone else gets 404.
 * It has to be a guard (not a check inside the handler) for SSE routes: Nest sends the 200 and event-stream
 * headers as soon as the handler is entered, so a late error would arrive with the wrong status.
 */
@Injectable()
export class OrderViewerGuard implements CanActivate {
  constructor(private readonly access: OrderAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest & { params: { id?: string } }>();
    if (!req.user) throw new AppException(ErrorCode.UNAUTHENTICATED, 'Authentication required.', HttpStatus.UNAUTHORIZED);
    await this.access.assertCanView(req.user, req.params.id ?? '');
    return true;
  }
}
