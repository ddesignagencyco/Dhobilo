import { NotificationChannel, Role } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsDefined, IsIn, IsInt, IsObject, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateNested } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Roles an announcement can target. Admins are never recipients. */
export const TARGET_ROLES = [Role.CUSTOMER, Role.VENDOR_OWNER, Role.VENDOR_STAFF, Role.RIDER] as const;
/** Announcements go out by push, SMS or email (WhatsApp needs pre-approved templates per message). */
export const ANNOUNCE_CHANNELS = [NotificationChannel.PUSH, NotificationChannel.SMS, NotificationChannel.EMAIL] as const;

export class SegmentDto {
  /** Who: any of these roles. Leave out for everyone (customers, vendors and riders). */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(TARGET_ROLES.length)
  @IsIn(TARGET_ROLES, { each: true })
  roles?: Role[];

  /** Only people connected to this city (customer address or orders, vendor, staff or rider in it). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cityId?: number;

  /** Only people who signed in or ordered in the last N days. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  activeWithinDays?: number;

  /** Only people who have neither signed in nor ordered for N days (win-back). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(730)
  inactiveForDays?: number;
}

export class PreviewAnnouncementDto {
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => SegmentDto)
  segment!: SegmentDto;

  /** Channels to count reach for. Default: push only. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(ANNOUNCE_CHANNELS, { each: true })
  channels?: NotificationChannel[];
}

export class CreateAnnouncementDto {
  @IsString()
  @Transform(trim)
  @Length(1, 65)
  title!: string;

  @IsString()
  @Transform(trim)
  @Length(1, 500)
  body!: string;

  /** Urdu versions, used for people whose language is Urdu. Both or neither. */
  @IsOptional()
  @IsString()
  @Transform(trim)
  @Length(1, 65)
  titleUr?: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(500)
  bodyUr?: string;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => SegmentDto)
  segment!: SegmentDto;

  /** Default: push only. People who switched a channel off in their settings are skipped on it. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(ANNOUNCE_CHANNELS, { each: true })
  channels?: NotificationChannel[];

  /** The `recipients` number from the preview. If the audience has changed since, nothing is sent (409). */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  confirmRecipients!: number;
}

export class ListAnnouncementsQueryDto {
  @IsOptional()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
