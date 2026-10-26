import { getQueueToken } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import type { Queue } from 'bullmq';
import Redis from 'ioredis';
import { Clock } from '../../common/time/clock';
import type { Env } from '../../config/env';
import { QUEUES } from '../../infra/queue/queues';
import { REDIS } from '../../infra/redis/redis.module';
import { OpsAlertService } from '../delivery/ops-alert.service';

export interface QueueStatus {
  queue: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  stuck: number;
  oldestWaitingSec: number | null;
  recentFailures: { id: string | undefined; name: string; reason: string; attemptsMade: number; failedAt: string | null }[];
  healthy: boolean;
}

/**
 * Watches every queue (BE-9.9): failed jobs pile up, a backlog grows, a job has been "active" far too long
 * (its worker died or it is stuck). Problems are logged and sent to the ops address once per cooldown, not every
 * minute. Jobs that fail all their retries stay in the failed set for inspection and can be re-run by an admin.
 */
@Injectable()
export class QueueHealthService {
  private readonly logger = new Logger(QueueHealthService.name);

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly alerts: OpsAlertService,
    private readonly clock: Clock,
    private readonly config: ConfigService<Env, true>,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  private queue(name: string): Queue {
    return this.moduleRef.get<Queue>(getQueueToken(name), { strict: false });
  }

  private get limits() {
    return {
      failed: this.config.get('QUEUE_ALERT_FAILED', { infer: true }),
      waiting: this.config.get('QUEUE_ALERT_WAITING', { infer: true }),
      stuckMin: this.config.get('QUEUE_ALERT_STUCK_MIN', { infer: true }),
    };
  }

  async status(): Promise<QueueStatus[]> {
    const limits = this.limits;
    const now = this.clock.now().getTime();

    return Promise.all(
      Object.values(QUEUES).map(async (name) => {
        const q = this.queue(name);
        const counts = await q.getJobCounts('waiting', 'active', 'delayed', 'failed');
        const [active, waiting, failed] = await Promise.all([q.getActive(0, 99), q.getWaiting(0, 0), q.getFailed(0, 4)]);
        const stuck = active.filter((j) => j.processedOn && now - j.processedOn > limits.stuckMin * 60_000).length;
        const oldest = waiting[0]?.timestamp;
        return {
          queue: name,
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          delayed: counts.delayed ?? 0,
          failed: counts.failed ?? 0,
          stuck,
          oldestWaitingSec: oldest ? Math.max(0, Math.round((now - oldest) / 1000)) : null,
          recentFailures: failed.map((j) => ({
            id: j.id,
            name: j.name,
            reason: String(j.failedReason ?? '').slice(0, 200),
            attemptsMade: j.attemptsMade,
            failedAt: j.finishedOn ? new Date(j.finishedOn).toISOString() : null,
          })),
          healthy: (counts.failed ?? 0) < limits.failed && (counts.waiting ?? 0) < limits.waiting && stuck === 0,
        } satisfies QueueStatus;
      }),
    );
  }

  /** One watch round: alerts for each unhealthy queue, at most once per cooldown per kind of problem. */
  async check(): Promise<{ unhealthy: string[]; alerted: number }> {
    const cooldownSec = this.config.get('QUEUE_ALERT_COOLDOWN_MIN', { infer: true }) * 60;
    const limits = this.limits;
    const statuses = await this.status();
    const unhealthy: string[] = [];
    let alerted = 0;
    for (const s of statuses) {
      const problems: [string, string][] = [];
      if (s.failed >= limits.failed) problems.push(['failed', `${s.failed} jobs failed all their retries (latest: ${s.recentFailures[0]?.reason ?? 'unknown'})`]);
      if (s.waiting >= limits.waiting) problems.push(['backlog', `${s.waiting} jobs are waiting${s.oldestWaitingSec ? `, the oldest for ${s.oldestWaitingSec}s` : ''}`]);
      if (s.stuck > 0) problems.push(['stuck', `${s.stuck} jobs have been running for over ${limits.stuckMin} minutes`]);
      if (problems.length) unhealthy.push(s.queue);
      for (const [kind, text] of problems) {
        const fresh = await this.redis.set(`ops:queue-alert:${s.queue}:${kind}`, '1', 'EX', cooldownSec, 'NX');
        if (fresh === 'OK') {
          alerted++;
          await this.alerts.alert(`Queue "${s.queue}" needs attention`, text, { queue: s.queue, kind });
        }
      }
    }
    if (unhealthy.length) this.logger.warn({ unhealthy }, 'Some queues are unhealthy');
    return { unhealthy, alerted };
  }

  /** Puts failed jobs back in line (after the cause is fixed). Returns how many were retried. */
  async retryFailed(name: string, limit = 100): Promise<number> {
    const q = this.queue(name);
    const jobs = await q.getFailed(0, limit - 1);
    let retried = 0;
    for (const job of jobs) {
      try {
        await job.retry('failed');
        retried++;
      } catch (err) {
        this.logger.warn({ err, queue: name, jobId: job.id }, 'Could not retry a failed job');
      }
    }
    return retried;
  }
}
