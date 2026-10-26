import { Test } from '@nestjs/testing';
import { WorkerModule } from '../src/worker.module';

/**
 * The worker is a separate Nest application. A service that needs something the worker module does not provide
 * only fails when the worker starts, which no other test does, so this one starts it.
 */
describe('Worker process (e2e)', () => {
  it('starts: every queue consumer and the services it needs can be built', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [WorkerModule] }).compile();
    await moduleRef.init();
    await moduleRef.close();
  });
});
