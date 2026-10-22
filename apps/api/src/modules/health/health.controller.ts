import { Controller, Get, HttpStatus, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import Redis from 'ioredis';
import { Public } from '../../common/decorators/public.decorator';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { REDIS } from '../../infra/redis/redis.module';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Liveness: the process is up. No dependency checks, so orchestrators don't restart us over a DB blip. */
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  /** Readiness: Postgres and Redis both answer. 503 otherwise so the LB stops routing here. */
  @Get('ready')
  async ready() {
    const [db, redis] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => 'up' as const, () => 'down' as const),
      this.redis.ping().then((r) => (r === 'PONG' ? ('up' as const) : ('down' as const)), () => 'down' as const),
    ]);
    const checks = { database: db, redis };
    if (db === 'down' || redis === 'down') {
      throw new AppException('NOT_READY', 'Service is not ready', HttpStatus.SERVICE_UNAVAILABLE, checks);
    }
    return { status: 'ok', checks };
  }
}
