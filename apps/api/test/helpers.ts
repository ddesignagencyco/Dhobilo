import { randomInt, randomUUID } from 'node:crypto';
import { INestApplication, Type } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { Role } from '@prisma/client';
import Redis from 'ioredis';
import type { Test as SuperTest } from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp, setupSwagger } from '../src/bootstrap';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { REDIS } from '../src/infra/redis/redis.constants';

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  redis: Redis;
  close(): Promise<void>;
}

export async function createTestApp(
  opts: {
    controllers?: Type<unknown>[];
    imports?: Type<unknown>[];
    customize?: (b: TestingModuleBuilder) => TestingModuleBuilder;
  } = {},
): Promise<TestApp> {
  let builder = Test.createTestingModule({
    imports: [AppModule, ...(opts.imports ?? [])],
    controllers: opts.controllers ?? [],
  });
  if (opts.customize) builder = opts.customize(builder);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ bufferLogs: true });
  configureApp(app);
  setupSwagger(app);
  await app.init();
  return {
    app,
    prisma: app.get(PrismaService),
    redis: app.get<Redis>(REDIS),
    close: () => app.close(),
  };
}

/** A unique, valid Pakistani mobile number in E.164 (+92300xxxxxxx). */
export const randomPhone = () => `+92300${String(randomInt(0, 10_000_000)).padStart(7, '0')}`;

/** Drops rate-limit counters and admin lockouts so tests don't leak into each other. */
export async function clearRateLimits(redis: Redis): Promise<void> {
  for (const pattern of ['rl:*', 'lock:*', 'otp:*']) {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
      cursor = next;
      if (keys.length) await redis.del(...keys);
    } while (cursor !== '0');
  }
}

/** Creates a user directly in the DB and mints an access token for it (no SMS/OTP dance). */
export async function createUserWithToken(
  t: TestApp,
  role: Role,
  extra: { status?: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED' } = {},
) {
  const user = await t.prisma.user.create({
    data: { phone: randomPhone(), role, status: extra.status ?? 'ACTIVE', referralCode: randomUUID().slice(0, 8).toUpperCase() },
  });
  const accessToken = await t.app
    .get(JwtService)
    .signAsync({ sub: user.id, role: user.role, sid: randomUUID() }, { secret: process.env.JWT_ACCESS_SECRET!, expiresIn: 600 });
  return { user, accessToken, auth: { Authorization: `Bearer ${accessToken}` } };
}

/** Full OTP login through the HTTP API (OTP_BYPASS code). Returns tokens and the refresh cookie. */
export async function otpLogin(
  http: { post(url: string): SuperTest },
  phone: string,
  role?: 'CUSTOMER' | 'VENDOR_OWNER' | 'RIDER',
) {
  await http.post('/api/v1/auth/otp/request').send({ phone }).expect(200);
  const res = await http
    .post('/api/v1/auth/otp/verify')
    .set('x-token-transport', 'body')
    .send({ phone, code: '123456', ...(role ? { role } : {}) })
    .expect(200);
  return res;
}
