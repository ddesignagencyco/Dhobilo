import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { GLOBAL_PREFIX, buildOpenApiDocument } from '../src/bootstrap';

/** Writes openapi.json (CI artifact, input for the typed FE client). Needs the same env as the API. */
async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix(GLOBAL_PREFIX);
  await app.init();
  const out = resolve(process.argv[2] ?? 'openapi.json');
  writeFileSync(out, JSON.stringify(buildOpenApiDocument(app), null, 2));
  await app.close();
  console.log(`OpenAPI written to ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
