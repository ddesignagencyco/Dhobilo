import { AdminRole, UserStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

const trimmed = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateAdminDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @Transform(trimmed)
  @IsString()
  @Length(2, 100)
  name!: string;

  /** Initial password, at least 12 characters. The admin should change it after first sign-in. */
  @IsString()
  @Length(12, 200)
  password!: string;

  @IsEnum(AdminRole)
  adminRole!: AdminRole;
}

export class UpdateAdminDto {
  @IsOptional()
  @IsEnum(AdminRole)
  adminRole?: AdminRole;

  /** ACTIVE re-enables the account; DEACTIVATED signs the admin out everywhere and blocks sign-in. */
  @IsOptional()
  @IsIn([UserStatus.ACTIVE, UserStatus.DEACTIVATED])
  status?: 'ACTIVE' | 'DEACTIVATED';
}

export class ChangeOwnPasswordDto {
  @IsString()
  @Length(1, 200)
  currentPassword!: string;

  @IsString()
  @Length(12, 200)
  newPassword!: string;
}
