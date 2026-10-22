import { JobStatus, JobType, RiderStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class RegisterRiderDto {
  /** Full name, shown to customers while the rider is on the way. */
  @Transform(trim)
  @IsString()
  @Length(2, 100)
  name!: string;

  /** 13-digit CNIC, with or without dashes. Stored encrypted. */
  @Transform(trim)
  @IsString()
  @Length(13, 15)
  cnic!: string;

  /** The city the rider works in (from GET /cities). */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cityId!: number;

  /** Cloudinary public_id of the profile photo (upload it first with POST /media/sign, kind `rider-photo`). */
  @IsString()
  @Length(5, 300)
  photoPublicId!: string;
}

export class LocationDto {
  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;
}

export class NearbyJobsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class DeclineJobDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class ReleaseJobDto {
  @Transform(trim)
  @IsString()
  @Length(3, 300)
  reason!: string;
}

export class FailJobDto {
  @Transform(trim)
  @IsString()
  @Length(3, 300)
  reason!: string;
}

export class CompleteJobDto {
  /** The 4-digit code the customer received (delivery drops). */
  @IsOptional()
  @Matches(/^\d{4}$/, { message: 'otp must be 4 digits' })
  otp?: string;

  /** Cloudinary public_id of a proof photo (upload with POST /media/sign, kind `delivery-proof`). Use when the code cannot be used. */
  @IsOptional()
  @IsString()
  @Length(5, 300)
  proofPhotoPublicId?: string;
}

export class EarningsQueryDto {
  /** First day to include, YYYY-MM-DD (city time). Defaults to 7 days ago. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  /** Last day to include, YYYY-MM-DD. Defaults to today. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
}

export class MyJobsQueryDto {
  /** `active` (default) = assigned, accepted or in transit; `history` = completed, failed and cancelled. */
  @IsOptional()
  @IsEnum({ active: 'active', history: 'history' })
  view?: 'active' | 'history';

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

// ───── admin ─────

export class ListRidersQueryDto {
  @IsOptional()
  @IsEnum(RiderStatus)
  status?: RiderStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cityId?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ListJobsQueryDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').map((v) => v.trim()).filter(Boolean) : value))
  @IsEnum(JobStatus, { each: true })
  status?: JobStatus[];

  @IsOptional()
  @IsEnum(JobType)
  jobType?: JobType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cityId?: number;

  @IsOptional()
  @IsUUID()
  riderId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  orderNo?: string;

  /** Only jobs whose window starts before this time. */
  @IsOptional()
  @IsDateString()
  scheduledBefore?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class AssignJobDto {
  @IsUUID()
  riderId!: string;
}

export class AdminJobReasonDto {
  @Transform(trim)
  @IsString()
  @Length(3, 300)
  reason!: string;
}

export class SetPartnerActiveDto {
  @IsBoolean()
  isActive!: boolean;
}
