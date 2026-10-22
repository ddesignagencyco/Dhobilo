import { JobStatus } from '@prisma/client';
import { JOB_TRANSITIONS, JobActor, canMoveJob, nextJobStatuses } from './job-state-machine';

const ALL = Object.values(JobStatus);
const ACTORS: JobActor[] = ['RIDER', 'ADMIN', 'SYSTEM', 'PARTNER'];

describe('delivery job state machine', () => {
  it('lists exactly the moves in the table and refuses everything else, for every actor', () => {
    for (const from of ALL) {
      for (const to of ALL) {
        for (const actor of ACTORS) {
          const expected = JOB_TRANSITIONS[from]?.[to]?.actors.includes(actor) ?? false;
          expect(canMoveJob(from, to, actor)).toBe(expected);
        }
      }
    }
  });

  it('never leaves a finished job', () => {
    for (const to of ALL) {
      for (const actor of ACTORS) {
        expect(canMoveJob(JobStatus.COMPLETED, to, actor)).toBe(false);
        expect(canMoveJob(JobStatus.CANCELLED, to, actor)).toBe(false);
      }
    }
  });

  it('lets only the rider (or partner) work a job forward, and only an admin revive a failed one', () => {
    expect(canMoveJob(JobStatus.ACCEPTED, JobStatus.IN_TRANSIT, 'RIDER')).toBe(true);
    expect(canMoveJob(JobStatus.ACCEPTED, JobStatus.IN_TRANSIT, 'SYSTEM')).toBe(false);
    expect(canMoveJob(JobStatus.IN_TRANSIT, JobStatus.COMPLETED, 'PARTNER')).toBe(true);
    expect(canMoveJob(JobStatus.FAILED, JobStatus.UNASSIGNED, 'ADMIN')).toBe(true);
    expect(canMoveJob(JobStatus.FAILED, JobStatus.UNASSIGNED, 'RIDER')).toBe(false);
  });

  it('cannot skip steps: no completing without being in transit, no starting an unaccepted job', () => {
    expect(canMoveJob(JobStatus.ACCEPTED, JobStatus.COMPLETED, 'RIDER')).toBe(false);
    expect(canMoveJob(JobStatus.UNASSIGNED, JobStatus.IN_TRANSIT, 'RIDER')).toBe(false);
    expect(canMoveJob(JobStatus.ASSIGNED, JobStatus.IN_TRANSIT, 'RIDER')).toBe(false);
  });

  it('reports the next steps an actor may take', () => {
    expect(nextJobStatuses(JobStatus.ASSIGNED, 'RIDER').sort()).toEqual([JobStatus.ACCEPTED, JobStatus.UNASSIGNED].sort());
    expect(nextJobStatuses(JobStatus.COMPLETED, 'ADMIN')).toEqual([]);
  });
});
