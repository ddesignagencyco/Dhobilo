import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import type { Env } from '../../config/env';

/**
 * Adds the pool settings to the connection string unless the URL already sets them (BE-9.4). Without a limit Prisma
 * sizes the pool from the CPU count, which on a big host can exhaust Postgres once several replicas run.
 */
export function withPoolSettings(url: string, poolSize: number, timeoutSec: number): string {
  if (!/^postgres(ql)?:\/\//.test(url)) return url;
  const u = new URL(url);
  if (!u.searchParams.has('connection_limit')) u.searchParams.set('connection_limit', String(poolSize));
  if (!u.searchParams.has('pool_timeout')) u.searchParams.set('pool_timeout', String(timeoutSec));
  return u.toString();
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService<Env, true>) {
    super({
      datasourceUrl: withPoolSettings(
        config.get('DATABASE_URL', { infer: true }),
        config.get('DB_POOL_SIZE', { infer: true }),
        config.get('DB_POOL_TIMEOUT_SEC', { infer: true }),
      ),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
