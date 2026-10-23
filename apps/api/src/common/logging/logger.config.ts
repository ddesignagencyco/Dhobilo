import type { IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { Params } from 'nestjs-pino';
import type { Env } from '../../config/env';

/** Paths scrubbed from every log line (SRS §7 / TRD §5.1): tokens, phone, CNIC, OTPs, passwords, card-like fields. */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.phone',
  '*.cnic',
  '*.cnicEnc',
  '*.code',
  '*.otp',
  '*.accessToken',
  '*.refreshToken',
  '*.token',
  '*.cardNumber',
  '*.cvv',
  // Payments and payouts (Phase 6): gateway credentials and signatures, checkout forms, and where money is sent.
  '*.pp_Password',
  '*.pp_SecureHash',
  '*.*.pp_Password',
  '*.*.pp_SecureHash',
  '*.formFields',
  '*.account',
  '*.accountRef',
  '*.iban',
  'req.headers["x-mock-signature"]',
  'req.headers["x-courier-signature"]',
];

export function loggerConfig(env: Pick<Env, 'NODE_ENV' | 'LOG_LEVEL'>): Params {
  return {
    pinoHttp: {
      level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
      // `req.id` is set by the requestId middleware (runs before pino-http), so logs and error bodies share one id.
      genReqId: (req: IncomingMessage) => (req as { id?: string }).id ?? randomUUID(),
      customProps: (req: IncomingMessage) => ({ requestId: (req as { id?: string }).id }),
      autoLogging: { ignore: (req: IncomingMessage) => req.url?.startsWith('/api/v1/health') ?? false },
      serializers: {
        req: (req: { id?: string; method?: string; url?: string }) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
      },
    },
  };
}
