import { timingSafeEqual } from 'node:crypto';
import { Controller, Get, Header, Headers, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { RawResponse } from '../../common/interceptors/response-envelope.interceptor';
import type { Env } from '../../config/env';
import { MetricsService } from './metrics.service';

/** Prometheus scrape endpoint. Off (404) unless METRICS_TOKEN is set; then it needs `Authorization: Bearer <token>`. */
@ApiExcludeController()
@Public()
@Controller('metrics')
export class MetricsController {
  private readonly token: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly metrics: MetricsService,
  ) {
    this.token = config.get('METRICS_TOKEN', { infer: true }) ?? '';
  }

  @Get()
  @RawResponse()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async scrape(@Headers('authorization') authorization?: string): Promise<string> {
    if (!this.token) throw new NotFoundException();
    const given = Buffer.from((authorization ?? '').replace(/^Bearer\s+/i, ''));
    const expected = Buffer.from(this.token);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new UnauthorizedException();
    return this.metrics.render();
  }
}
