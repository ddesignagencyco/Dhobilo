import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsMiddleware } from './metrics.middleware';
import { MetricsService } from './metrics.service';

function makeService() {
  const queue = {
    name: 'notifications',
    getJobCounts: jest.fn().mockResolvedValue({ waiting: 3, active: 1, delayed: 0, failed: 2 }),
    getWaiting: jest.fn().mockResolvedValue([{ timestamp: Date.now() - 42_000 }]),
  };
  const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
  const redis = { ping: jest.fn().mockRejectedValue(new Error('down')) };
  return new MetricsService([queue] as never, prisma as never, redis as never);
}

const controller = (token: string, svc = makeService()) =>
  new MetricsController({ get: () => token } as never, svc);

describe('metrics', () => {
  it('is disabled (404) without a token and refuses a wrong one', async () => {
    await expect(controller('').scrape('Bearer x')).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller('a'.repeat(16)).scrape('Bearer nope')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller('a'.repeat(16)).scrape(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('exposes request, queue and dependency metrics to the right token', async () => {
    const svc = makeService();
    svc.observeRequest('POST', '/api/v1/orders', 201, 0.4);
    svc.observeRequest('GET', '/api/v1/cities', 503, 0.1);
    const text = await controller('t'.repeat(16), svc).scrape(`Bearer ${'t'.repeat(16)}`);
    expect(text).toContain('http_requests_total{method="POST",route="/api/v1/orders",status="201"} 1');
    expect(text).toContain('http_request_duration_seconds_bucket{le="0.5",method="POST",route="/api/v1/orders",status_class="2xx"} 1');
    expect(text).toContain('queue_jobs{queue="notifications",state="failed"} 2');
    expect(text).toMatch(/queue_oldest_waiting_seconds\{queue="notifications"\} (4[2-9]|5\d)/);
    expect(text).toContain('app_dependency_up{dependency="database"} 1');
    expect(text).toContain('app_dependency_up{dependency="redis"} 0');
  });

  it('labels requests by route template, not raw URL, and skips the metrics endpoint itself', async () => {
    const svc = makeService();
    const mw = new MetricsMiddleware(svc);
    const run = (route: { path: string } | undefined, baseUrl: string, status: number) => {
      let finish: () => void = () => undefined;
      const res = { statusCode: status, on: (_: string, cb: () => void) => (finish = cb) };
      mw.use({ method: 'GET', route, baseUrl } as never, res as never, () => undefined);
      finish();
    };
    run({ path: '/orders/:id' }, '/api/v1', 200);
    run(undefined, '', 404);
    run({ path: '/metrics' }, '/api/v1', 200);
    const text = await svc.render();
    expect(text).toContain('route="/api/v1/orders/:id"');
    expect(text).toContain('route="unmatched",status="404"');
    expect(text).not.toContain('route="/api/v1/metrics"');
  });
});
