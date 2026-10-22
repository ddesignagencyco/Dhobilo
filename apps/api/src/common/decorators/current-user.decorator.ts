import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser, AuthedRequest } from '../auth/auth-user';

/** The authenticated user. Only meaningful on routes that are not @Public(). */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user as AuthUser;
});
