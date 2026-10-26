import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReferralsService } from './referrals.service';

@ApiTags('promos')
@ApiBearerAuth()
@Roles(Role.CUSTOMER)
@Controller('me/referral')
export class ReferralController {
  constructor(private readonly referrals: ReferralsService) {}

  /** Share code, pending invites, and reward codes earned so far. */
  @Get()
  overview(@CurrentUser() user: AuthUser) {
    return this.referrals.overview(user.id);
  }
}
