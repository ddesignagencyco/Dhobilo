import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'must be a date like 2026-10-24';

export class AnalyticsQueryDto {
  /** First day (Pakistan time, inclusive). Default: 6 days before `to`. */
  @IsOptional()
  @Matches(DATE, { message: `from ${DATE_MESSAGE}` })
  from?: string;

  /** Last day (Pakistan time, inclusive). Default: today. */
  @IsOptional()
  @Matches(DATE, { message: `to ${DATE_MESSAGE}` })
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cityId?: number;
}

export class TopVendorsQueryDto extends AnalyticsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class RollupDto {
  /** First day to recompute. Default: yesterday. */
  @IsOptional()
  @Matches(DATE, { message: `from ${DATE_MESSAGE}` })
  from?: string;

  /** Last day to recompute. Default: same as `from`. */
  @IsOptional()
  @Matches(DATE, { message: `to ${DATE_MESSAGE}` })
  to?: string;
}

export class VendorAnalyticsQueryDto {
  /** How many days back (ending today). Default 7. */
  @IsOptional()
  @Type(() => Number)
  @IsIn([7, 30, 90])
  days?: 7 | 30 | 90;
}
