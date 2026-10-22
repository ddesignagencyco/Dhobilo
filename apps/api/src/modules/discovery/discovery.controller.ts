import { Controller, Get, Param, ParseUUIDPipe, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthedRequest } from '../../common/auth/auth-user';
import { Public } from '../../common/decorators/public.decorator';
import { Paged } from '../../common/interceptors/response-envelope.interceptor';
import { RateLimiter } from '../../infra/redis/rate-limiter.service';
import { DiscoveryService } from './discovery.service';
import { SearchVendorsQueryDto } from './dto/discovery.dto';

/** Public, SEO-friendly browse endpoints (TRD §16.1): no login needed to look at vendors. */
@ApiTags('discovery')
@Public()
@Controller('vendors')
export class DiscoveryController {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly limiter: RateLimiter,
  ) {}

  /**
   * Vendors that can serve a location right now, nearest first by default (`sort=distance|rating|price`).
   * Page with `meta.nextCursor`. Prices are PKR strings.
   */
  @Get()
  async search(@Query() query: SearchVendorsQueryDto, @Req() req: AuthedRequest) {
    await this.limiter.consume(`rl:discovery:ip:${req.ip ?? 'unknown'}`, 120, 60);
    const { items, nextCursor } = await this.discovery.search(query);
    return new Paged(items, { nextCursor });
  }

  @Get(':id')
  vendor(@Param('id', ParseUUIDPipe) id: string) {
    return this.discovery.vendorDetail(id);
  }

  /** Active items grouped by category. */
  @Get(':id/catalog')
  catalog(@Param('id', ParseUUIDPipe) id: string) {
    return this.discovery.catalog(id);
  }
}
