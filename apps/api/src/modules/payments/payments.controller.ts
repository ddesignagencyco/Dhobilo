import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PaymentMethod, Role } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { InitiatePaymentDto } from './dto/payments.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /**
   * Creates (or resumes) the hosted checkout for one of your orders. Card and wallet credentials are entered on
   * the provider's page, never sent to this API. COD orders cannot be paid online.
   */
  @Post('initiate')
  @HttpCode(200)
  @Roles(Role.CUSTOMER)
  initiate(@CurrentUser() user: AuthUser, @Body() dto: InitiatePaymentDto) {
    return this.payments.initiate(user, dto);
  }
}

/** Kept in sync with the gateway registry; used by the docs/schema test. */
export const ONLINE_PAYMENT_METHODS = [
  PaymentMethod.CARD,
  PaymentMethod.JAZZCASH,
  PaymentMethod.EASYPAISA,
  PaymentMethod.RAAST,
] as const;
