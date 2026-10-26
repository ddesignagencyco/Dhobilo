import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';

/** The browser origins allowed to call the API with credentials (CORS_ORIGINS, else the web app's own URL). */
export function allowedOrigins(config: ConfigService<Env, true>): string[] {
  const raw = config.get('CORS_ORIGINS', { infer: true }) || config.get('APP_URL', { infer: true });
  return String(raw)
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
}
