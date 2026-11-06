import { DeletionStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { DELETION_REASON_CODES } from '../privacy.constants';

export class RequestDeletionDto {
  /** The 6-digit code sent to your phone (request one with `POST /auth/otp/request` first). Confirms it is really you. */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(/^\d{6}$/, { message: 'code must be the 6-digit code from your phone' })
  code!: string;

  /** Optional fixed reason code; helps us improve. Free text is not accepted. */
  @IsOptional()
  @IsIn(DELETION_REASON_CODES)
  reasonCode?: (typeof DELETION_REASON_CODES)[number];
}

export class ListDeletionRequestsQueryDto {
  @IsOptional()
  @IsEnum(DeletionStatus)
  status?: DeletionStatus;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class LegalHoldDto {
  /** Why the data must be kept (case number, investigation, legal request). Do not include personal details. */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(5, 300)
  reason!: string;
}
