import { createRoleBffHandler } from '@/lib/bff/role-handler';
import { clearVendorSession, readVendorSession, writeVendorSession } from '@/lib/vendor/session';

const handler = createRoleBffHandler({
  read: readVendorSession,
  write: writeVendorSession,
  clear: clearVendorSession,
});

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;

export const dynamic = 'force-dynamic';
