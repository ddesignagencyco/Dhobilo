import { Controller, Get, INestApplication, Param, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp, setupSwagger } from '../src/bootstrap';
import { Public } from '../src/common/decorators/public.decorator';
import { Audit } from '../src/modules/audit/audit.decorator';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { AppException } from '../src/common/errors/app.exception';

@Public()
@Controller('e2e-probe')
class ProbeController {
  @Get('boom')
  boom() {
    throw new AppException('PROBE_FAILED', 'probe failed', 422, { why: 'test' });
  }

  @Post(':id/audited')
  @Audit({ action: 'PROBE_RAN', entity: 'Probe', idParam: 'id' })
  audited(@Param('id') id: string) {
    return { id };
  }
}

describe('API core (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(app);
    setupSwagger(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/live returns the enveloped ok', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
    expect(res.body).toEqual({ data: { status: 'ok' } });
  });

  it('GET /health/ready checks Postgres and Redis', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    expect(res.body.data.checks).toEqual({ database: 'up', redis: 'up' });
  });

  it('echoes a valid x-request-id and mints one otherwise', async () => {
    const fixed = 'req-1234567890';
    const a = await request(app.getHttpServer()).get('/api/v1/health/live').set('x-request-id', fixed);
    expect(a.headers['x-request-id']).toBe(fixed);
    const b = await request(app.getHttpServer()).get('/api/v1/health/live').set('x-request-id', '!!bad!!');
    expect(b.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('renders domain errors in the standard error envelope with the request id', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/e2e-probe/boom').expect(422);
    expect(res.body.error).toMatchObject({ code: 'PROBE_FAILED', message: 'probe failed', details: { why: 'test' } });
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('returns NOT_FOUND for unknown routes', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/nope').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects unknown/invalid bodies via the global ValidationPipe', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/dev/test-email').send({ to: 'not-an-email', extra: 1 }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details.map((d: { field: string }) => d.field).sort()).toEqual(['extra', 'to']);
  });

  it('answers malformed JSON and oversized bodies with the standard error envelope, not a 500 or HTML', async () => {
    const bad = await request(app.getHttpServer())
      .post('/api/v1/dev/test-email')
      .set('Content-Type', 'application/json')
      .send('{"to": ')
      .expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
    expect(bad.body.error.requestId).toEqual(expect.any(String));

    const big = await request(app.getHttpServer())
      .post('/api/v1/dev/test-email')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ to: 'a@b.co', subject: 'x'.repeat(200_000) }))
      .expect(413);
    expect(big.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('writes an AuditLog row for @Audit() handlers', async () => {
    const entityId = `probe-${Date.now()}`;
    await request(app.getHttpServer()).post(`/api/v1/e2e-probe/${entityId}/audited`).expect(201);
    const rows = await prisma.auditLog.findMany({ where: { entity: 'Probe', entityId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'PROBE_RAN', requestId: expect.any(String) });
  });

  it('serves OpenAPI JSON docs listing the versioned routes', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/docs-json').expect(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(Object.keys(res.body.paths)).toContain('/api/v1/health/ready');
  });
});
