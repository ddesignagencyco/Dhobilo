import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';
import { JwtModule } from '@nestjs/jwt';
import { PromotionsModule } from '../promos/promotions.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OwnershipGuard } from './guards/ownership.guard';
import { RolesGuard } from './guards/roles.guard';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';

/** Guards run in registration order: authenticate -> role check -> ownership check. */
@Global()
@Module({
  imports: [JwtModule.register({}), PromotionsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    TokenService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: OwnershipGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
  exports: [TokenService],
})
export class AuthModule {}
