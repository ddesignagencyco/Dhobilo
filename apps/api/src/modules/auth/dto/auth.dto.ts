import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

/** Roles that may be chosen on first OTP login; vendor/rider onboarding completes in their own flows. */
export const SIGNUP_ROLES = [Role.CUSTOMER, Role.VENDOR_OWNER, Role.RIDER] as const;

export class RequestOtpDto {
  /** Pakistani mobile number in any common format (03XX..., +92 3XX..., 92...). */
  @IsString()
  @Length(10, 20)
  phone!: string;
}

export class VerifyOtpDto {
  @IsString()
  @Length(10, 20)
  phone!: string;

  /** 6-digit code from the SMS. */
  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit number' })
  code!: string;

  /** Only used when this phone logs in for the first time; defaults to CUSTOMER. */
  @IsOptional()
  @IsIn(SIGNUP_ROLES)
  role?: (typeof SIGNUP_ROLES)[number];
}

export class RefreshDto {
  /** Needed only for clients that cannot use the httpOnly cookie. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  refreshToken?: string;
}

export class AdminLoginDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @Length(1, 200)
  password!: string;
}
