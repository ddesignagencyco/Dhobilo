import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { text } from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { requestId } from './common/middleware/request-id.middleware';
import type { Env } from './config/env';
import { enrichDocument } from './docs/enrich';
import { SWAGGER_UI_OPTIONS, createDocumentBuilder } from './docs/swagger.config';

export const GLOBAL_PREFIX = 'api/v1';

/** Everything that must be identical between the real server and e2e tests. */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  const trustProxy = config.get('TRUST_PROXY', { infer: true });
  if (trustProxy > 0) {
    (app.getHttpAdapter().getInstance() as Express).set('trust proxy', trustProxy);
  }

  app.use(requestId);
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());
  // CSV catalog imports arrive as raw text (JSON is parsed by Nest's default body parser).
  app.use(text({ type: 'text/csv', limit: '1mb' }));

  const rawOrigins = config.get('CORS_ORIGINS', { infer: true }) || config.get('APP_URL', { infer: true });
  const origins = String(rawOrigins)
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true, exposedHeaders: ['x-request-id'] });

  app.setGlobalPrefix(GLOBAL_PREFIX);
  app.enableShutdownHooks();
}

/** The OpenAPI document: what the code declares, plus the hand-written docs from src/docs (examples, who can call, errors). */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  return enrichDocument(SwaggerModule.createDocument(app, createDocumentBuilder().build()));
}

export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup(`${GLOBAL_PREFIX}/docs`, app, buildOpenApiDocument(app), {
    ...SWAGGER_UI_OPTIONS,
    jsonDocumentUrl: `${GLOBAL_PREFIX}/docs-json`,
    yamlDocumentUrl: `${GLOBAL_PREFIX}/docs-yaml`,
  });
}
