import type { OperationDocs } from '../types';
import { ok } from './helpers';

const ADMIN = ['ADMIN'] as const;

export const operationsDocs: OperationDocs = {
  'GET /admin/queues': {
    summary: 'Background queue health',
    tag: 'admin-queues',
    who: [...ADMIN],
    description:
      'Every background queue (notifications, payments, delivery, reports and so on): how many jobs are waiting, running, delayed and failed, how long the oldest waiting job has been there, any job that has been running suspiciously long (`stuck`) and the latest failures with their reason. `healthy` is false when a queue has too many failed jobs, a large backlog or a stuck job; the same conditions email the operations address (at most once an hour per problem). A failed job is one that used up all its retries.',
    response: {
      example: ok({
        healthy: false,
        queues: [
          {
            queue: 'notifications',
            waiting: 3,
            active: 1,
            delayed: 0,
            failed: 12,
            stuck: 0,
            oldestWaitingSec: 4,
            recentFailures: [{ id: '4821', name: 'send-sms', reason: 'gateway timeout', attemptsMade: 5, failedAt: '2026-10-26T09:12:00.000Z' }],
            healthy: false,
          },
        ],
      }),
    },
  },
  'POST /admin/queues/{name}/retry-failed': {
    summary: 'Retry failed jobs',
    tag: 'admin-queues',
    who: [...ADMIN],
    description: 'Puts a queue’s failed jobs (up to 100 at a time) back in line, after the cause has been fixed. Jobs are written to be repeat-safe, so retrying never doubles an effect.',
    params: { name: { example: 'notifications', description: 'A queue name from **Background queue health**.' } },
    response: { example: ok({ queue: 'notifications', retried: 12 }) },
    errors: [{ status: 400, code: 'VALIDATION_FAILED', when: 'The queue name is not one of ours.' }],
  },
};
