import { randomInt, randomUUID } from 'node:crypto';
import { INestApplication, Type } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { Role, VendorStatus } from '@prisma/client';
import Redis from 'ioredis';
import type { Test as SuperTest } from 'supertest';
import { AppModule } from '../src/app.module';
import { FieldCrypto } from '../src/common/crypto/field-crypto';
import { AppException } from '../src/common/errors/app.exception';
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

/** 13 digits, not all the same. */
export const randomCnic = () => String(randomInt(1, 9)) + String(randomInt(0, 1_000_000_000_000)).padStart(12, '0');

/** Ensures a city and the standard service categories exist in the (truncated) test database. */
export async function ensureCatalogBasics(t: TestApp) {
  const city = await t.prisma.city.upsert({ where: { name: 'Lahore' }, update: { isActive: true }, create: { name: 'Lahore' } });
  const [washIron, dryClean] = await Promise.all(
    ['Wash & Iron', 'Dry Cleaning'].map((name) => t.prisma.serviceCategory.upsert({ where: { name }, update: {}, create: { name } })),
  );
  return { cityId: city.id, washIronId: washIron.id, dryCleanId: dryClean.id };
}

/** A vendor (owner + vendor row) created straight in the DB, in any status, with a ready-to-use owner token. */
export async function createVendorFixture(
  t: TestApp,
  cityId: number,
  opts: { status?: VendorStatus; name?: string; createdAt?: Date } = {},
) {
  const owner = await createUserWithToken(t, Role.VENDOR_OWNER);
  const crypto = t.app.get(FieldCrypto);
  const cnic = randomCnic();
  const status = opts.status ?? VendorStatus.APPROVED;
  const vendor = await t.prisma.vendor.create({
    data: {
      ownerId: owner.user.id,
      cityId,
      businessName: opts.name ?? `Fixture Laundry ${randomUUID().slice(0, 6)}`,
      addressLine: '12 Test Street, Gulberg',
      lat: 31.52,
      lng: 74.35,
      cnicEnc: crypto.encrypt(cnic, 'vendor.cnic'),
      cnicHash: crypto.hash('cnic', cnic),
      status,
      ...(status === VendorStatus.APPROVED ? { approvedAt: new Date() } : {}),
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    },
  });
  await t.prisma.vendorDocument.createMany({
    data: (['CNIC_FRONT', 'CNIC_BACK', 'SHOP_PHOTO'] as const).map((type) => ({
      vendorId: vendor.id,
      type,
      publicId: `dhoblio/test/vendors/${owner.user.id}/docs/${type.toLowerCase()}`,
      url: `https://res.cloudinary.com/demo/image/authenticated/v1/dhoblio/test/vendors/${owner.user.id}/docs/${type.toLowerCase()}.jpg`,
    })),
  });
  return { owner, vendor, cnic };
}

/** In-memory stand-in for CloudinaryService: no network, but keeps the real folder-ownership rule. */
export function fakeCloudinary() {
  return {
    signUpload: jest.fn(),
    verifyAsset: jest.fn(async (publicId: string, folderPrefix: string) => {
      if (!publicId.startsWith(`${folderPrefix}/`)) {
        throw new AppException('MEDIA_INVALID_ASSET', 'Asset is outside the expected folder', 400);
      }
      if (publicId.endsWith('missing')) throw new AppException('MEDIA_INVALID_ASSET', 'Uploaded asset was not found', 400);
      return { publicId, url: `https://res.cloudinary.com/demo/image/authenticated/v1/${publicId}.jpg`, bytes: 1000, format: 'jpg' };
    }),
    privateDownloadUrl: jest.fn((publicId: string, format: string, ttlSec: number) => `https://signed.test/${publicId}.${format}?ttl=${ttlSec}`),
  };
}

/** Admin user + token. */
export const createAdmin = (t: TestApp) => createUserWithToken(t, Role.ADMIN);
