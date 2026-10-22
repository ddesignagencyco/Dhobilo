import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { QUEUES, QUEUE_JOB_OPTIONS } from './queues';

export function redisConnectionFromUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0,
    tls: u.protocol === 'rediss:' ? {} : undefined,
  };
}

const queueRegistrations = Object.values(QUEUES).map((name) =>
  BullModule.registerQueue({ name, defaultJobOptions: QUEUE_JOB_OPTIONS[name] }),
);

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: redisConnectionFromUrl(config.get('REDIS_URL', { infer: true })),
      }),
    }),
    ...queueRegistrations,
  ],
  exports: [BullModule],
})
export class QueueModule {}
