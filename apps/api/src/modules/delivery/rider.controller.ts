import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthUser, AuthedRequest } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Paged } from '../../common/interceptors/response-envelope.interceptor';
import { CodService } from '../finance/cod.service';
import { DeliveryJobsService } from './delivery-jobs.service';
import {
  CompleteJobDto,
  DeclineJobDto,
  EarningsQueryDto,
  FailJobDto,
  LocationDto,
  MyJobsQueryDto,
  NearbyJobsQueryDto,
  RegisterRiderDto,
  ReleaseJobDto,
} from './dto/rider.dto';
import { CurrentRider } from './rider-context';
import type { RiderContext } from './rider-context';
import { RiderContextGuard } from './rider-context.guard';
import { RiderAppService } from './rider-app.service';
import { RiderRegistrationService } from './rider-registration.service';
import { RequireRiderStatus } from './rider-context';

@ApiTags('rider')
@ApiBearerAuth()
@Roles(Role.RIDER)
@Controller('rider')
export class RiderController {
  constructor(
    private readonly registration: RiderRegistrationService,
    private readonly app: RiderAppService,
    private readonly jobs: DeliveryJobsService,
    private readonly cod: CodService,
  ) {}

  /**
   * Apply to ride. Upload a profile photo first (POST /media/sign with kind `rider-photo`), then send its public id
   * here. The account stays PENDING until an admin approves it. A rejected rider re-submits through the same call.
   */
  @Post('register')
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterRiderDto, @Req() req: AuthedRequest) {
    return this.registration.register(user, dto, { ip: req.ip, requestId: req.id });
  }

  /** Where the application stands (works while pending, rejected or suspended). */
  @Get('status')
  status(@CurrentUser() user: AuthUser) {
    return this.app.status(user.id);
  }

  @Get('me')
  @UseGuards(RiderContextGuard)
  me(@CurrentRider() rider: RiderContext) {
    return this.app.me(rider);
  }

  /** Start taking work. Needs the rider's current position so they can be found right away. */
  @Post('online')
  @HttpCode(200)
  @UseGuards(RiderContextGuard)
  online(@CurrentRider() rider: RiderContext, @Body() dto: LocationDto) {
    return this.app.goOnline(rider, dto.lat, dto.lng);
  }

  @Post('offline')
  @HttpCode(200)
  @UseGuards(RiderContextGuard)
  offline(@CurrentRider() rider: RiderContext) {
    return this.app.goOffline(rider);
  }

  /** Send the position every 20-30 seconds while online. A rider who stops pinging stops being offered jobs. */
  @Post('location')
  @HttpCode(200)
  @UseGuards(RiderContextGuard)
  location(@CurrentRider() rider: RiderContext, @Body() dto: LocationDto) {
    return this.app.ping(rider, dto.lat, dto.lng);
  }

  /** Jobs nobody has taken yet in the rider's city, nearest first. Claim one with POST /rider/jobs/:id/claim. */
  @Get('jobs/available')
  @UseGuards(RiderContextGuard)
  available(@CurrentRider() rider: RiderContext, @Query() q: NearbyJobsQueryDto) {
    return this.app.available(rider, q.limit);
  }

  /** The rider's own jobs: `view=active` (default) or `view=history`. */
  @Get('jobs')
  @UseGuards(RiderContextGuard)
  async myJobs(@CurrentRider() rider: RiderContext, @Query() q: MyJobsQueryDto) {
    const { items, nextCursor } = await this.app.myJobs(rider, q);
    return new Paged(items, { nextCursor });
  }

  @Get('jobs/:id')
  @UseGuards(RiderContextGuard)
  job(@CurrentRider() rider: RiderContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.app.job(rider, id);
  }

  /** Take an unassigned job. If another rider got there first: 409 `JOB_ALREADY_TAKEN`. */
  @Post('jobs/:id/claim')
  @HttpCode(200)
  @UseGuards(RiderContextGuard)
  async claim(@CurrentRider() rider: RiderContext, @Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    await this.jobs.claim(rider, id, req.id);
    return this.app.job(rider, id);
  }

  /** Accept a job that was offered to you. */
  @Post('jobs/:id/accept')
  @HttpCode(200)
  @UseGuards(RiderContextGuard)
  async accept(@CurrentRider() rider: RiderContext, @Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    await this.jobs.accept(rider, id, req.id);
    return this.app.job(rider, id);
  }

  /** Turn down an offered job. */
  @Post('jobs/:id/decline')
  @HttpCode(200)
  @UseGuards(RiderContextGuard)
  async decline(@CurrentRider() rider: RiderContext, @Param('id', ParseUUIDPipe) id: string, @Body() _dto: DeclineJobDto, @Req() req: AuthedRequest) {
    await this.jobs.decline(rider, id, req.id);
    return { id, status: 'UNASSIGNED' };
  }

  /** Give back a job you accepted but have not started. */
  @Post('jobs/:id/release')
  @HttpCode(200)
  @UseGuards(RiderContextGuard)
  async release(@CurrentRider() rider: RiderContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReleaseJobDto, @Req() req: AuthedRequest) {
    await this.jobs.release(rider, id, dto.reason, req.id);
    return { id, status: 'UNASSIGNED' };
  }

  /** Set out. For a delivery this tells the customer the order is on its way and sends them their code. */
  @Post('jobs/:id/start')
  @HttpCode(200)
  @UseGuards(RiderContextGuard)
  async start(@CurrentRider() rider: RiderContext, @Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    await this.jobs.start(rider, id, req.id);
    return this.app.job(rider, id);
  }

  /** Finish the leg. A delivery needs the customer's 4-digit code (`otp`) or a proof photo. */
  @Post('jobs/:id/complete')
  @HttpCode(200)
  @UseGuards(RiderContextGuard)
  async complete(@CurrentRider() rider: RiderContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CompleteJobDto, @Req() req: AuthedRequest) {
    await this.jobs.complete(rider, id, dto, req.id);
    return this.app.job(rider, id);
  }

  /** Report that the job could not be done (customer unreachable, wrong address ...). Support takes it from there. */
  @Post('jobs/:id/fail')
  @HttpCode(200)
  @UseGuards(RiderContextGuard)
  async fail(@CurrentRider() rider: RiderContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: FailJobDto, @Req() req: AuthedRequest) {
    await this.jobs.fail(rider, id, dto.reason, req.id);
    return this.app.job(rider, id);
  }

  /** Completed jobs and earnings per day (city time). Defaults to the last 7 days. */
  @Get('earnings')
  @UseGuards(RiderContextGuard)
  @RequireRiderStatus('APPROVED', 'SUSPENDED')
  earnings(@CurrentRider() rider: RiderContext, @Query() q: EarningsQueryDto) {
    return this.app.earnings(rider, q);
  }

  /** Cash the rider has collected on COD orders and still has to hand over. */
  @Get('cod')
  @UseGuards(RiderContextGuard)
  @RequireRiderStatus('APPROVED', 'SUSPENDED')
  codCash(@CurrentRider() rider: RiderContext) {
    return this.cod.riderSummary(rider.id);
  }
}
