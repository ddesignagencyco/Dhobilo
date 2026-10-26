import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Paged } from '../../common/interceptors/response-envelope.interceptor';
import { CreateReviewDto, ListVendorReviewsQueryDto } from './dto/reviews.dto';
import { ReviewsService } from './reviews.service';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';

@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @ApiBearerAuth()
  @Roles(Role.CUSTOMER)
  @RateLimit({ name: 'review-create', limit: 30, windowSec: 86400 })
  @Post('orders/:orderId/reviews')
  create(@CurrentUser() user: AuthUser, @Param('orderId', ParseUUIDPipe) orderId: string, @Body() dto: CreateReviewDto) {
    return this.reviews.create(user.id, orderId, dto);
  }

  @Public()
  @Get('vendors/:vendorId/reviews')
  async list(@Param('vendorId', ParseUUIDPipe) vendorId: string, @Query() q: ListVendorReviewsQueryDto) {
    const { items, nextCursor, summary } = await this.reviews.listForVendor(vendorId, q);
    return new Paged(items, { nextCursor, summary });
  }
}
