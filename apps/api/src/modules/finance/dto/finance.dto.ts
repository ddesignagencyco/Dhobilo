import { CommissionScope, PayoutMethod, PayoutStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const AMOUNT = /^\d{1,10}(\.\d{1,2})?$/;

export class EarningsSummaryQueryDto {
  /** `day`, `week` (Monday to Sunday) or `month`. */
  @IsIn(['day', 'week', 'month'])
  period!: 'day' | 'week' | 'month';

  /** Any day inside the period you want, YYYY-MM-DD (shop city time). Defaults to today. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;
}

export class EarningsLinesQueryDto {
  /** First day, YYYY-MM-DD. Defaults to 30 days ago. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  /** Last day, YYYY-MM-DD. Defaults to today. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class RequestPayoutDto {
  /** How much to withdraw, in PKR. */
  @Matches(AMOUNT, { message: 'amount must be an amount like 5000 or 5000.50' })
  amount!: string;

  @IsEnum(PayoutMethod)
  method!: PayoutMethod;

  /** For `BANK`: your IBAN (PK + 22 characters). For `WALLET`: the JazzCash / Easypaisa mobile number. */
  @Transform(trim)
  @IsString()
  @Length(10, 40)
  account!: string;
}

export class ListPayoutsQueryDto {
  @IsOptional()
  @IsEnum(PayoutStatus)
  status?: PayoutStatus;

  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class PayPayoutDto {
  /** The bank or wallet transfer reference, for the records. */
  @Transform(trim)
  @IsString()
  @Length(3, 100)
  txnRef!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class RejectPayoutDto {
  @Transform(trim)
  @IsString()
  @Length(3, 300)
  reason!: string;
}

export class SettleCodDto {
  @IsUUID()
  riderId!: string;

  /** What the rider handed in. Must equal the total of the collections being settled. */
  @Matches(AMOUNT, { message: 'amount must be an amount like 5000 or 5000.50' })
  amount!: string;

  /** Settle only these collections (from the rider's list). Leave out to settle everything the rider owes. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  collectionIds?: string[];

  /** Receipt or bank deposit reference. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  reference?: string;
}

export class ListSettlementsQueryDto {
  @IsOptional()
  @IsUUID()
  riderId?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class CreateCommissionRuleDto {
  @IsEnum(CommissionScope)
  scope!: CommissionScope;

  /** Required for `VENDOR` rules. */
  @IsOptional()
  @IsUUID()
  vendorId?: string;

  /** Required for `CATEGORY` rules (from GET /service-categories). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  /** Percent of the order value we keep, 0 to 50. */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(50)
  ratePct!: number;

  /** When it starts. Defaults to now; cannot be in the past. Orders already placed keep the rate they were placed with. */
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}

export class ListCommissionRulesQueryDto {
  @IsOptional()
  @IsEnum(CommissionScope)
  scope?: CommissionScope;

  @IsOptional()
  @IsUUID()
  vendorId?: string;
}

export class LedgerAdjustmentDto {
  @IsUUID()
  vendorId!: string;

  /** Signed: positive credits the vendor, negative debits them. Not zero. */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-1_000_000)
  @Max(1_000_000)
  amount!: number;

  /** Why. Shown in the vendor's ledger. */
  @Transform(trim)
  @IsString()
  @Length(5, 300)
  note!: string;
}

export class LedgerQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
