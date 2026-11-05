import { createRoleBffHandler } from '@/lib/bff/role-handler';
import { clearCustomerSession, readCustomerSession, writeCustomerSession } from '@/lib/customer/session';

const handler = createRoleBffHandler({
  read: readCustomerSession,
  write: writeCustomerSession,
  clear: clearCustomerSession,
});

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;

export const dynamic = 'force-dynamic';
