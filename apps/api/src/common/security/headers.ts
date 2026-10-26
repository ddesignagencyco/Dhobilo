import type { NextFunction, Request, Response } from 'express';
import type { HelmetOptions } from 'helmet';

/**
 * Response headers for a JSON API (BE-9.2). The default policy forbids everything (`default-src 'none'`), which is
 * right for JSON and file downloads; the interactive docs page needs scripts and styles, so it gets its own,
 * narrow policy. HSTS is only sent in production, where TLS ends in front of us.
 */
export function securityHeaders(production: boolean): HelmetOptions {
  return {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] },
    },
    strictTransportSecurity: production ? { maxAge: 31_536_000, includeSubDomains: true, preload: false } : false,
    referrerPolicy: { policy: 'no-referrer' },
    frameguard: { action: 'deny' },
    crossOriginResourcePolicy: { policy: 'same-site' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
  };
}

const DOCS = /^\/api\/v1\/docs/;

/** The docs page is a small static app: allow its own scripts and styles, nothing from elsewhere. */
export function docsPolicy(req: Request, res: Response, next: NextFunction): void {
  if (DOCS.test(req.path)) {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
  }
  next();
}

/**
 * API answers are personal (orders, addresses, earnings) and must never be kept by a shared cache or a proxy.
 * A handler that sets its own Cache-Control (file downloads) replaces this value.
 */
export function noStoreForApi(req: Request, res: Response, next: NextFunction): void {
  if (req.path.startsWith('/api/') && !DOCS.test(req.path)) res.setHeader('Cache-Control', 'no-store');
  next();
}
