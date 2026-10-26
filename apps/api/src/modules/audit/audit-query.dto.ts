import { Role } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class ListAuditLogsQueryDto {
  /** Kind of record, e.g. `Vendor`, `Payout`, `Order`. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  entity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  entityId?: string;

  /** What happened, e.g. `PAYOUT_APPROVED`. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  action?: string;

  /** Who did it. */
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @IsEnum(Role)
  actorRole?: Role;

  /** Earliest moment, inclusive (ISO 8601, e.g. 2026-10-24T00:00:00+05:00). */
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** Latest moment, inclusive. */
  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
