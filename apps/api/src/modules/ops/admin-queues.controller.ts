import { Controller, Get, HttpCode, Param, ParseEnumPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { QUEUES } from '../../infra/queue/queues';
import { Audit } from '../audit/audit.decorator';
import { QueueHealthService } from './queue-health.service';

/** Name to value map for the enum pipe. */
const QUEUE_NAMES: Record<string, string> = Object.fromEntries(Object.values(QUEUES).map((n) => [n, n]));

@ApiTags('admin-queues')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/queues')
export class AdminQueuesController {
  constructor(private readonly health: QueueHealthService) {}

  /** Every background queue: how much is waiting, running, delayed and failed, anything stuck, and the latest failures. */
  @Get()
  async list() {
    const queues = await this.health.status();
    return { healthy: queues.every((q) => q.healthy), queues };
  }

  /** Puts a queue's failed jobs (up to 100) back in line, once the cause has been fixed. */
  @Post(':name/retry-failed')
  @HttpCode(200)
  @Audit({ action: 'QUEUE_FAILED_RETRIED', entity: 'Queue', idParam: 'name' })
  async retry(@Param('name', new ParseEnumPipe(QUEUE_NAMES)) name: string) {
    return { queue: name, retried: await this.health.retryFailed(name) };
  }
}
