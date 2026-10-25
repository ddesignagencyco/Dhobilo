import { CommissionScope, PayoutMethod, PayoutStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateCommissionRuleDto {
  @IsEnum(CommissionScope)
  scope!: CommissionScope;

  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  ratePct!: number;

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;
}

export class UpdateCommissionRuleDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  ratePct?: number;

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;
}

export class ListCommissionRulesQueryDto {
  @IsOptional()
  @IsEnum(CommissionScope)
  scope?: CommissionScope;

  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;
}

export class RequestPayoutDto {
  /** Plain decimal, e.g. "1500.00". */
  @IsString()
  @Transform(trim)
  @MaxLength(20)
  amount!: string;

  @IsEnum(PayoutMethod)
  method!: PayoutMethod;

  /** IBAN or wallet number. Only the last 4 digits are shown back. */
  @IsString()
  @Transform(trim)
  @Length(5, 64)
  accountRef!: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(300)
  note?: string;
}

export class ListPayoutsQueryDto {
  @IsOptional()
  @IsEnum(PayoutStatus)
  status?: PayoutStatus;

  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

export class RejectPayoutDto {
  @IsString()
  @Transform(trim)
  @Length(3, 300)
  reason!: string;
}

export class PayPayoutDto {
  /** Bank transfer / wallet transaction id. */
  @IsString()
  @Transform(trim)
  @Length(3, 100)
  txnRef!: string;
}

export class CodBalancesQueryDto {
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(100)
  q?: string;
}

export class CodCollectionsQueryDto {
  @IsOptional()
  @IsUUID()
  riderId?: string;

  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  settled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

export class SettleCodDto {
  @IsUUID()
  riderId!: string;

  /** Bank deposit slip / receipt number. */
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(100)
  reference?: string;
}

export class EarningsQueryDto {
  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  range?: 'day' | 'week' | 'month';
}
