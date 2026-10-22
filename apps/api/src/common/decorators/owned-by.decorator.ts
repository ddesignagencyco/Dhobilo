import { SetMetadata, Type } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';

export const OWNED_BY_KEY = 'ownedBy';

/**
 * Implemented per resource (order, complaint, ...). Returns the user ids allowed to touch the resource,
 * or null when the resource does not exist.
 */
export interface OwnershipResolver {
  allowedUserIds(resourceId: string, user: AuthUser): Promise<string[] | null>;
}

export interface OwnedByMetadata {
  resolver: Type<OwnershipResolver>;
  /** Route param holding the resource id. */
  param: string;
}

/** Enforced by OwnershipGuard: only the owner (or an admin) may reach the handler. Others get 404. */
export const OwnedBy = (resolver: Type<OwnershipResolver>, param = 'id') =>
  SetMetadata(OWNED_BY_KEY, { resolver, param } satisfies OwnedByMetadata);
