import { JobStatus } from '@prisma/client';

const J = JobStatus;

/** Who is acting on a delivery job. PARTNER is a courier company reporting through its webhook. */
export type JobActor = 'RIDER' | 'ADMIN' | 'SYSTEM' | 'PARTNER';

interface Rule {
  actors: readonly JobActor[];
}

/**
 * The only legal moves for a delivery job. Anything not listed is refused.
 *
 *   UNASSIGNED -> ASSIGNED     dispatch offers it to a rider
 *   UNASSIGNED -> ACCEPTED     a rider claims it from the list (manual mode), or an admin force-assigns
 *   ASSIGNED   -> ACCEPTED     the offered rider accepts
 *   ASSIGNED   -> UNASSIGNED   declined, offer lapsed, or an admin takes it back
 *   ACCEPTED   -> UNASSIGNED   the rider hands it back before starting, or an admin reassigns
 *   ACCEPTED   -> IN_TRANSIT   the rider (or partner) is under way
 *   IN_TRANSIT -> COMPLETED    done, with proof where required
 *   FAILED     -> UNASSIGNED   an admin sends it out again
 */
export const JOB_TRANSITIONS: Readonly<Partial<Record<JobStatus, Readonly<Partial<Record<JobStatus, Rule>>>>>> = {
  [J.UNASSIGNED]: {
    [J.ASSIGNED]: { actors: ['SYSTEM', 'ADMIN'] },
    [J.ACCEPTED]: { actors: ['RIDER', 'ADMIN', 'PARTNER'] },
    [J.FAILED]: { actors: ['ADMIN'] },
    [J.CANCELLED]: { actors: ['SYSTEM', 'ADMIN'] },
  },
  [J.ASSIGNED]: {
    [J.ACCEPTED]: { actors: ['RIDER', 'ADMIN'] },
    [J.UNASSIGNED]: { actors: ['RIDER', 'SYSTEM', 'ADMIN'] },
    [J.FAILED]: { actors: ['ADMIN'] },
    [J.CANCELLED]: { actors: ['SYSTEM', 'ADMIN'] },
  },
  [J.ACCEPTED]: {
    [J.IN_TRANSIT]: { actors: ['RIDER', 'ADMIN', 'PARTNER'] },
    [J.UNASSIGNED]: { actors: ['RIDER', 'ADMIN'] },
    [J.FAILED]: { actors: ['RIDER', 'ADMIN', 'PARTNER'] },
    [J.CANCELLED]: { actors: ['SYSTEM', 'ADMIN'] },
  },
  [J.IN_TRANSIT]: {
    [J.COMPLETED]: { actors: ['RIDER', 'ADMIN', 'PARTNER'] },
    [J.FAILED]: { actors: ['RIDER', 'ADMIN', 'PARTNER'] },
    [J.UNASSIGNED]: { actors: ['ADMIN'] },
    [J.CANCELLED]: { actors: ['SYSTEM', 'ADMIN'] },
  },
  [J.FAILED]: {
    [J.UNASSIGNED]: { actors: ['ADMIN'] },
    [J.CANCELLED]: { actors: ['SYSTEM', 'ADMIN'] },
  },
};

export const TERMINAL_JOB_STATUSES: readonly JobStatus[] = [J.COMPLETED, J.CANCELLED];
/** A job in one of these is occupying its rider. */
export const ACTIVE_JOB_STATUSES: readonly JobStatus[] = [J.ASSIGNED, J.ACCEPTED, J.IN_TRANSIT];
/** Statuses an admin can still reassign or fail. */
export const OPEN_JOB_STATUSES: readonly JobStatus[] = [J.UNASSIGNED, J.ASSIGNED, J.ACCEPTED, J.IN_TRANSIT, J.FAILED];

export function canMoveJob(from: JobStatus, to: JobStatus, actor: JobActor): boolean {
  return JOB_TRANSITIONS[from]?.[to]?.actors.includes(actor) ?? false;
}

/** Statuses `actor` may move a job to from `from`. */
export function nextJobStatuses(from: JobStatus, actor: JobActor): JobStatus[] {
  return Object.entries(JOB_TRANSITIONS[from] ?? {})
    .filter(([, rule]) => rule!.actors.includes(actor))
    .map(([to]) => to as JobStatus);
}
