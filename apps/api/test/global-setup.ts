import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { E2E_DATABASE_URL, E2E_REDIS_URL, databaseName } from './e2e-env';

/**
 * Runs once before the e2e suite: makes sure the dedicated test database exists and is migrated, then wipes it
 * (and the test Redis db). Refuses to touch anything that isn't clearly a test database.
 */
export default async function globalSetup(): Promise<void> {
  const name = databaseName(E2E_DATABASE_URL);
  if (!name.endsWith('_test')) throw new Error(`Refusing to reset "${name}": e2e databases must end in _test`);

  const adminUrl = E2E_DATABASE_URL.replace(`/${name}`, '/postgres');
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  try {
    const found = await admin.$queryRaw<unknown[]>`SELECT 1 FROM pg_database WHERE datname = ${name}`;
    if (found.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.$disconnect();
  }

  execSync('npx prisma migrate deploy', {
    cwd: resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    stdio: 'pipe',
  });

  const db = new PrismaClient({ datasources: { db: { url: E2E_DATABASE_URL } } });
  try {
    const tables = await db.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    // TRUNCATE bypasses the append-only row triggers on AuditLog / OrderStatusHistory, which is what we want here.
    await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  } finally {
    await db.$disconnect();
  }

  const redis = new Redis(E2E_REDIS_URL);
  await redis.flushdb();
  await redis.quit();
}
