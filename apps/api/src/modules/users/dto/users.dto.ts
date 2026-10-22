import { Locale } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpdateMeDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  name?: string;

  /** UI and notification language. */
  @IsOptional()
  @IsEnum(Locale)
  locale?: Locale;
}

export class DeviceTokenDto {
  /** FCM / web-push registration token. */
  @IsString()
  @Length(20, 4096)
  token!: string;

  @IsIn(['android', 'ios', 'web'])
  platform!: 'android' | 'ios' | 'web';
}

export class RemoveDeviceTokenDto {
  @IsString()
  @MaxLength(4096)
  token!: string;
}

export class UpdateNotificationPrefsDto {
  /** App/browser push notifications. */
  @IsOptional()
  @IsBoolean()
  push?: boolean;

  /** WhatsApp messages (if switched off, SMS is used when allowed). */
  @IsOptional()
  @IsBoolean()
  whatsapp?: boolean;

  @IsOptional()
  @IsBoolean()
  sms?: boolean;

  /** Email (vendors only; customers are not emailed). */
  @IsOptional()
  @IsBoolean()
  email?: boolean;
}
