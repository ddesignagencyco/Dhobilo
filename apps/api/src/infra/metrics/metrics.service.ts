import { getQueueToken } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUES } from '../queue/queues';
import { REDIS } from '../redis/redis.constants';

export const METRIC_QUEUES = Symbol('METRIC_QUEUES');
export const metricQueueProviders = [
  {
    provide: METRIC_QUEUES,
    useFactory: (...queues: Queue[]) => queues,
    inject: Object.values(QUEUES).map((name) => getQueueToken(name)),
  },
];

const JOB_STATES = ['waiting', 'active', 'delayed', 'failed'] as const;

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

/** Prometheus metrics for the API (OPS-9.1). Queue and dependency gauges are read at scrape time. */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  private readonly httpDuration: Histogram<'method' | 'route' | 'status_class'>;
  private readonly httpTotal: Counter<'method' | 'route' | 'status'>;

  constructor(
    @Inject(METRIC_QUEUES) private readonly queues: Queue[],
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {
    collectDefaultMetrics({ register: this.registry });

    this.httpDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'API request duration by route template and status class',
      labelNames: ['method', 'route', 'status_class'],
      buckets: [0.025, 0.05, 0.1, 0.25, 0.5, 0.8, 1, 1.5, 2.5, 5, 10],
      registers: [this.registry],
    });
    this.httpTotal = new Counter({
      name: 'http_requests_total',
      help: 'API requests by route template and status',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });

    const self = this;
    new Gauge({
      name: 'queue_jobs',
      help: 'BullMQ jobs per queue and state',
      labelNames: ['queue', 'state'],
      registers: [this.registry],
      async collect() {
        for (const q of self.queues) {
          const counts = await q.getJobCounts(...JOB_STATES);
          for (const state of JOB_STATES) this.set({ queue: q.name, state }, counts[state] ?? 0);
        }
      },
    });
    new Gauge({
      name: 'queue_oldest_waiting_seconds',
      help: 'Age of the oldest waiting job per queue (a stuck or dead worker makes this grow)',
      labelNames: ['queue'],
      registers: [this.registry],
      async collect() {
        for (const q of self.queues) {
          const [oldest] = await q.getWaiting(0, 0);
          this.set({ queue: q.name }, oldest ? Math.max(0, (Date.now() - oldest.timestamp) / 1000) : 0);
        }
      },
    });
    new Gauge({
      name: 'app_dependency_up',
      help: '1 when the dependency answers, 0 when it does not',
      labelNames: ['dependency'],
      registers: [this.registry],
      async collect() {
        const check = async (fn: () => Promise<unknown>) => {
          try {
            await withTimeout(fn(), 2000);
            return 1;
          } catch {
            return 0;
          }
        };
        this.set({ dependency: 'database' }, await check(() => self.prisma.$queryRaw`SELECT 1`));
        this.set({ dependency: 'redis' }, await check(() => self.redis.ping()));
      },
    });
  }

  observeRequest(method: string, route: string, status: number, seconds: number): void {
    this.httpDuration.observe({ method, route, status_class: `${Math.floor(status / 100)}xx` }, seconds);
    this.httpTotal.inc({ method, route, status: String(status) });
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }
}
