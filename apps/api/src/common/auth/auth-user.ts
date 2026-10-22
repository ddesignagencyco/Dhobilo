import type { Role } from '@prisma/client';
import type { Request } from 'express';

/** What guards attach to `req.user` after a valid access token. Role/status come from the DB, not the token. */
export interface AuthUser {
  id: string;
  role: Role;
  sessionId: string;
}

export type AuthedRequest = Request & { id?: string; user?: AuthUser };
