import { createRoleBffHandler } from '@/lib/bff/role-handler';
import { clearRiderSession, readRiderSession, writeRiderSession } from '@/lib/rider/session';

const handler = createRoleBffHandler({
  read: readRiderSession,
  write: writeRiderSession,
  clear: clearRiderSession,
});

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;

export const dynamic = 'force-dynamic';
