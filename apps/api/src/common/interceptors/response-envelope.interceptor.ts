import { CallHandler, ExecutionContext, Injectable, NestInterceptor, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';

export const RAW_RESPONSE_KEY = 'rawResponse';

/** Opt out of the `{ data }` envelope (SSE streams, gateway webhooks, file responses). */
export const RawResponse = () => SetMetadata(RAW_RESPONSE_KEY, true);

/** Return from a handler to attach `meta` (e.g. a pagination cursor) next to `data`. */
export class Paged<T, M = Record<string, unknown>> {
  constructor(
    public readonly data: T,
    public readonly meta: M,
  ) {}
}

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const raw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_KEY, [context.getHandler(), context.getClass()]);
    if (raw) return next.handle();

    return next.handle().pipe(
      map((result) => {
        if (result instanceof Paged) return { data: result.data, meta: result.meta };
        return { data: result === undefined ? null : result };
      }),
    );
  }
}
