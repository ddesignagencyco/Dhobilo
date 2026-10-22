import { BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { resolveError } from './all-exceptions.filter';

describe('resolveError', () => {
  it('passes AppException code, status and details through', () => {
    const r = resolveError(new AppException('ORDER_INVALID_TRANSITION', 'nope', HttpStatus.CONFLICT, { from: 'A' }));
    expect(r).toEqual({ status: 409, code: 'ORDER_INVALID_TRANSITION', message: 'nope', details: { from: 'A' } });
  });

  it('maps Nest HttpExceptions to stable codes', () => {
    expect(resolveError(new NotFoundException()).code).toBe(ErrorCode.NOT_FOUND);
    expect(resolveError(new BadRequestException(['a must be a string'])).code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  it('maps Prisma unique violations to 409 and missing rows to 404', () => {
    const dup = new Prisma.PrismaClientKnownRequestError('x', { code: 'P2002', clientVersion: 'test' });
    const missing = new Prisma.PrismaClientKnownRequestError('x', { code: 'P2025', clientVersion: 'test' });
    expect(resolveError(dup).status).toBe(409);
    expect(resolveError(missing).status).toBe(404);
  });

  it('maps exposed http-errors from middleware (body-parser) instead of calling them 500s', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), { status: 413, statusCode: 413, expose: true });
    expect(resolveError(tooLarge)).toMatchObject({ status: 413, code: 'PAYLOAD_TOO_LARGE' });
    const wrongType = Object.assign(new Error('unsupported'), { status: 415, expose: true });
    expect(resolveError(wrongType)).toMatchObject({ status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
    // Anything not explicitly safe to expose stays an opaque 500.
    expect(resolveError(Object.assign(new Error('secret'), { status: 400, expose: false })).status).toBe(500);
    expect(resolveError(Object.assign(new Error('boom'), { status: 502, expose: true })).status).toBe(500);
  });

  it('hides internals for unknown errors', () => {
    const r = resolveError(new Error('db password is hunter2'));
    expect(r.status).toBe(500);
    expect(r.message).toBe('Internal server error');
  });
});
