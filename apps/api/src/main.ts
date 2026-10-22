import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp, setupSwagger } from './bootstrap';
import type { Env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApp(app);
  setupSwagger(app);

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const port = config.get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
  app.get(Logger).log(`API listening on :${port} (docs at /api/v1/docs)`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
