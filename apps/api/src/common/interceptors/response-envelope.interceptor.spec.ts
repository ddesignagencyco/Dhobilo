import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { Paged, ResponseEnvelopeInterceptor } from './response-envelope.interceptor';

function run(result: unknown, raw = false) {
  const reflector = { getAllAndOverride: () => raw } as unknown as Reflector;
  const ctx = { getHandler: () => null, getClass: () => null } as unknown as ExecutionContext;
  return lastValueFrom(new ResponseEnvelopeInterceptor(reflector).intercept(ctx, { handle: () => of(result) }));
}

describe('ResponseEnvelopeInterceptor', () => {
  it('wraps plain results in { data }', async () => {
    expect(await run({ id: 1 })).toEqual({ data: { id: 1 } });
  });

  it('turns undefined into data: null', async () => {
    expect(await run(undefined)).toEqual({ data: null });
  });

  it('emits meta for Paged results', async () => {
    expect(await run(new Paged([1, 2], { nextCursor: 'c' }))).toEqual({ data: [1, 2], meta: { nextCursor: 'c' } });
  });

  it('leaves @RawResponse handlers untouched', async () => {
    expect(await run({ ok: true }, true)).toEqual({ ok: true });
  });
});
