import type { JobType } from '@prisma/client';

export interface CourierJobInput {
  jobId: string;
  orderNo: string;
  jobType: JobType;
  from: { name: string; address: string; lat: number; lng: number };
  to: { name: string; address: string; lat: number; lng: number };
  scheduledStart: Date;
  scheduledEnd: Date;
}

/** What a partner tells us, already translated into our words. */
export interface CourierEvent {
  /** The partner's own id for this notification: the same id arriving twice is applied once. */
  eventId: string;
  /** The reference we got back from createJob. */
  trackingRef: string;
  status: 'IN_TRANSIT' | 'COMPLETED' | 'FAILED';
  reason?: string;
}

/**
 * Adapter for a courier company that can do pickups and deliveries instead of our own riders (FR-R7, TRD §9). One
 * implementation per partner; the partner a city uses is chosen in the admin panel.
 */
export interface CourierProvider {
  readonly code: string;
  /** Hand a job to the partner. Returns their tracking reference. */
  createJob(input: CourierJobInput): Promise<{ partnerRef: string }>;
  /** Best effort: tell the partner we no longer need this job. */
  cancelJob(partnerRef: string): Promise<void>;
  /** True only if the webhook really came from the partner. */
  verifyWebhook(headers: Record<string, string | string[] | undefined>, body: unknown): boolean;
  /** Turns the partner's payload into our event, or null if it is malformed. */
  parseWebhook(body: unknown): CourierEvent | null;
}

export const COURIER_PROVIDERS = Symbol('COURIER_PROVIDERS');
