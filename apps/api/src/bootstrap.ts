import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import type { Express } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { requestId } from './common/middleware/request-id.middleware';
import type { Env } from './config/env';

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

  const rawOrigins = config.get('CORS_ORIGINS', { infer: true }) || config.get('APP_URL', { infer: true });
  const origins = String(rawOrigins)
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true, exposedHeaders: ['x-request-id'] });

  app.setGlobalPrefix(GLOBAL_PREFIX);
  app.enableShutdownHooks();
}

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const options = new DocumentBuilder()
    .setTitle('Dhoblio API')
    .setDescription('Laundry & dry-cleaning aggregator platform (v1)')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, options);
}

export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup(`${GLOBAL_PREFIX}/docs`, app, buildOpenApiDocument(app), {
    jsonDocumentUrl: `${GLOBAL_PREFIX}/docs-json`,
  });
}
