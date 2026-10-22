import type { Job } from 'bullmq';
import { DISPATCH_JOB, OFFER_TIMEOUT_JOB, SWEEP_DISPATCH_JOB } from './dispatch.scheduler';
import { DispatchProcessor } from './dispatch.processor';
import type { DispatchService } from './dispatch.service';

const job = (name: string, data?: unknown) => ({ name, data }) as unknown as Job;

describe('DispatchProcessor', () => {
  const service = {
    dispatch: jest.fn().mockResolvedValue('offered'),
    offerTimedOut: jest.fn().mockResolvedValue(true),
    sweep: jest.fn().mockResolvedValue({ redispatched: 2, expired: 1 }),
  };
  const processor = new DispatchProcessor(service as unknown as DispatchService);

  beforeEach(() => jest.clearAllMocks());

  it('routes a dispatch job to the dispatcher', async () => {
    expect(await processor.process(job(DISPATCH_JOB, { jobId: 'j1' }))).toEqual({ outcome: 'offered' });
    expect(service.dispatch).toHaveBeenCalledWith('j1');
  });

  it('routes an offer timeout with the job and rider it was set for', async () => {
    expect(await processor.process(job(OFFER_TIMEOUT_JOB, { jobId: 'j1', riderId: 'r1' }))).toEqual({ lapsed: true });
    expect(service.offerTimedOut).toHaveBeenCalledWith('j1', 'r1');
  });

  it('runs the sweeper without data', async () => {
    expect(await processor.process(job(SWEEP_DISPATCH_JOB))).toEqual({ redispatched: 2, expired: 1 });
  });

  it('fails loudly on a job name it does not know, so the mistake is visible rather than silently dropped', async () => {
    await expect(processor.process(job('mystery'))).rejects.toThrow('No handler for dispatch job "mystery"');
  });

  it('lets a dispatch error through so the queue retries it with backoff', async () => {
    service.dispatch.mockRejectedValueOnce(new Error('partner down'));
    await expect(processor.process(job(DISPATCH_JOB, { jobId: 'j2' }))).rejects.toThrow('partner down');
  });
});
