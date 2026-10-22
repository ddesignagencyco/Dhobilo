import type { DefaultJobOptions } from 'bullmq';

/** Queue names from TRD §9. */
export const QUEUES = {
  NOTIFICATIONS: 'notifications',
  ORDER_TIMERS: 'order-timers',
  DISPATCH: 'dispatch',
  PAYMENTS: 'payments',
  FINANCE: 'finance',
  EXPORTS: 'exports',
  MEDIA: 'media',
  ANALYTICS: 'analytics',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

const base: DefaultJobOptions = {
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

/** Retry/backoff per TRD §9. Handlers must be idempotent. */
export const QUEUE_JOB_OPTIONS: Record<QueueName, DefaultJobOptions> = {
  [QUEUES.NOTIFICATIONS]: { ...base, attempts: 5, backoff: { type: 'exponential', delay: 10_000 } },
  [QUEUES.ORDER_TIMERS]: { ...base, attempts: 3, backoff: { type: 'exponential', delay: 5_000 } },
  [QUEUES.DISPATCH]: { ...base, attempts: 5, backoff: { type: 'exponential', delay: 5_000 } },
  [QUEUES.PAYMENTS]: { ...base, attempts: 8, backoff: { type: 'exponential', delay: 10_000 } },
  [QUEUES.FINANCE]: { ...base, attempts: 5, backoff: { type: 'exponential', delay: 10_000 } },
  [QUEUES.EXPORTS]: { ...base, attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
  [QUEUES.MEDIA]: { ...base, attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
  [QUEUES.ANALYTICS]: { ...base, attempts: 3, backoff: { type: 'exponential', delay: 60_000 } },
};
