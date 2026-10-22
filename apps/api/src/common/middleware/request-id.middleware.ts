import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';
const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

/** Reuses a well-formed inbound x-request-id, otherwise mints one; echoes it on the response. */
export function requestId(req: Request & { id?: string }, res: Response, next: NextFunction): void {
  const inbound = req.header(REQUEST_ID_HEADER);
  const id = inbound && SAFE_ID.test(inbound) ? inbound : randomUUID();
  req.id = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}
