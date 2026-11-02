import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthUser, AuthedRequest } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminAreaOnly } from '../../common/decorators/admin-area.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Paged } from '../../common/interceptors/response-envelope.interceptor';
import { ReasonDto } from '../admin/dto/admin-vendors.dto';
import { AdminDeliveryService } from './admin-delivery.service';
import { DeliveryJobsService } from './delivery-jobs.service';
import { AssignJobDto, ListJobsQueryDto, ListRidersQueryDto, SetPartnerActiveDto } from './dto/rider.dto';
import { RiderReviewService } from './rider-review.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@AdminAreaOnly('delivery')
@Controller('admin')
export class AdminDeliveryController {
  constructor(
    private readonly riders: RiderReviewService,
    private readonly board: AdminDeliveryService,
    private readonly jobs: DeliveryJobsService,
  ) {}

  // ───── rider review ─────

  /** Rider applications and the rider roster, oldest first. Filter by status, city or name/phone. */
  @Get('riders')
  async listRiders(@Query() q: ListRidersQueryDto) {
    const { items, nextCursor } = await this.riders.list(q);
    return new Paged(items, { nextCursor });
  }

  /** Rider detail with the CNIC masked. */
  @Get('riders/:id')
  rider(@Param('id', ParseUUIDPipe) id: string) {
    return this.riders.detail(id);
  }

  /** Plaintext CNIC. Each call is written to the audit log. */
  @Get('riders/:id/cnic')
  cnic(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthUser, @Req() req: AuthedRequest) {
    return this.riders.revealCnic(id, { admin, ip: req.ip, requestId: req.id });
  }

  @Post('riders/:id/approve')
  @HttpCode(200)
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthUser, @Req() req: AuthedRequest) {
    return this.riders.approve(id, { admin, ip: req.ip, requestId: req.id });
  }

  @Post('riders/:id/reject')
  @HttpCode(200)
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @CurrentUser() admin: AuthUser, @Req() req: AuthedRequest) {
    return this.riders.reject(id, dto.reason, { admin, ip: req.ip, requestId: req.id });
  }

  /** Suspends the rider: they go offline and their unstarted jobs go back to dispatch. */
  @Post('riders/:id/suspend')
  @HttpCode(200)
  suspend(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @CurrentUser() admin: AuthUser, @Req() req: AuthedRequest) {
    return this.riders.suspend(id, dto.reason, { admin, ip: req.ip, requestId: req.id });
  }

  @Post('riders/:id/reactivate')
  @HttpCode(200)
  reactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthUser, @Req() req: AuthedRequest) {
    return this.riders.reactivate(id, { admin, ip: req.ip, requestId: req.id });
  }

  // ───── dispatch board ─────

  /** Counts for the top of the dispatch board, optionally for one city. */
  @Get('delivery/summary')
  @ApiQuery({ name: 'cityId', required: false, type: Number })
  summary(@Query('cityId') cityId?: string) {
    return this.board.summary(cityId ? Number(cityId) : undefined);
  }

  /** Delivery jobs, oldest first. Try `status=UNASSIGNED,FAILED` for what needs attention. */
  @Get('delivery/jobs')
  async listJobs(@Query() q: ListJobsQueryDto) {
    const { items, nextCursor } = await this.board.list(q);
    return new Paged(items, { nextCursor });
  }

  @Get('delivery/jobs/:id')
  job(@Param('id', ParseUUIDPipe) id: string) {
    return this.board.detail(id);
  }

  /** Give the job to a specific rider right now (they are told). Whoever had it loses it. */
  @Post('delivery/jobs/:id/assign')
  @HttpCode(200)
  async assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignJobDto, @CurrentUser() admin: AuthUser, @Req() req: AuthedRequest) {
    await this.jobs.reassign(id, dto.riderId, admin.id, req.id);
    return this.board.detail(id);
  }

  /** Take the job from its rider and put it back in the pool, skipping that rider. */
  @Post('delivery/jobs/:id/unassign')
  @HttpCode(200)
  async unassign(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthUser, @Req() req: AuthedRequest) {
    await this.jobs.reassign(id, undefined, admin.id, req.id);
    return this.board.detail(id);
  }

  /** Mark the job as failed (nobody can do it, customer unreachable ...). */
  @Post('delivery/jobs/:id/fail')
  @HttpCode(200)
  async fail(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @CurrentUser() admin: AuthUser, @Req() req: AuthedRequest) {
    await this.jobs.markFailed(id, dto.reason, admin.id, req.id);
    return this.board.detail(id);
  }

  /** Send a failed or stuck job back to dispatch from scratch. */
  @Post('delivery/jobs/:id/redispatch')
  @HttpCode(200)
  async redispatch(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthUser, @Req() req: AuthedRequest) {
    await this.jobs.redispatch(id, admin.id, req.id);
    return this.board.detail(id);
  }

  // ───── courier partners ─────

  @Get('courier-partners')
  partners() {
    return this.board.partners();
  }

  /** Turn a partner on or off. Choose which cities use it with PATCH /admin/cities/:id (`courierPartnerId`). */
  @Patch('courier-partners/:id')
  setPartner(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetPartnerActiveDto, @CurrentUser() admin: AuthUser, @Req() req: AuthedRequest) {
    return this.board.setPartnerActive(id, dto.isActive, admin, req.id);
  }
}
