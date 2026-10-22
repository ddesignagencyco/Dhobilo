import { SetMetadata } from '@nestjs/common';
import type { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/** Restrict a route to the listed roles. Without it, any authenticated active user may call the route. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
