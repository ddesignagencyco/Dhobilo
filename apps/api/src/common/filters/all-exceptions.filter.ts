import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';

interface ResolvedError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

const STATUS_CODES: Record<number, string> = {
  400: ErrorCode.VALIDATION_FAILED,
  401: ErrorCode.UNAUTHENTICATED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  429: ErrorCode.RATE_LIMITED,
};

const MIDDLEWARE_CODES: Record<number, string> = {
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
};

export function resolveError(exception: unknown): ResolvedError {
  if (exception instanceof AppException) {
    return {
      status: exception.getStatus(),
      code: exception.code,
      message: exception.message,
      details: exception.details,
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const body = exception.getResponse();
    const message =
      typeof body === 'string'
        ? body
        : Array.isArray((body as { message?: unknown }).message)
          ? 'Request failed validation'
          : ((body as { message?: string }).message ?? exception.message);
    return {
      status,
      code: STATUS_CODES[status] ?? ErrorCode.INTERNAL,
      message,
      details: typeof body === 'object' ? (body as { message?: unknown }).message : undefined,
    };
  }

  // http-errors style errors from Express middleware (body-parser: 413 too large, 415 wrong type, ...).
  const httpLike = exception as { status?: unknown; statusCode?: unknown; expose?: unknown; message?: unknown } | null;
  const clientStatus = Number(httpLike?.statusCode ?? httpLike?.status);
  if (httpLike && httpLike.expose === true && clientStatus >= 400 && clientStatus < 500) {
    return {
      status: clientStatus,
      code: MIDDLEWARE_CODES[clientStatus] ?? STATUS_CODES[clientStatus] ?? 'BAD_REQUEST',
      message: typeof httpLike.message === 'string' ? httpLike.message : 'Bad request',
    };
  }

  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    if (exception.code === 'P2002') {
      return { status: HttpStatus.CONFLICT, code: ErrorCode.CONFLICT, message: 'Resource already exists' };
    }
    if (exception.code === 'P2025') {
      return { status: HttpStatus.NOT_FOUND, code: ErrorCode.NOT_FOUND, message: 'Resource not found' };
    }
  }

  return { status: HttpStatus.INTERNAL_SERVER_ERROR, code: ErrorCode.INTERNAL, message: 'Internal server error' };
}

/** Maps every thrown error to `{ error: { code, message, details?, requestId } }`. Never leaks internals on 5xx. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request & { id?: string }>();
    const res = http.getResponse<Response>();

    const { status, code, message, details } = resolveError(exception);

    if (status >= 500) {
      this.logger.error({ err: exception, requestId: req.id }, 'Unhandled exception');
    }

    if (res.headersSent) return;

    res.status(status).json({
      error: { code, message, ...(details !== undefined ? { details } : {}), requestId: req.id },
    });
  }
}
