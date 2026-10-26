import { ReportFormat, ReportStatus, ReportType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateReportDto {
  @IsEnum(ReportType)
  type!: ReportType;

  /** Default CSV. */
  @IsOptional()
  @IsEnum(ReportFormat)
  format?: ReportFormat;

  /** First day (Pakistan time, inclusive). Default: 29 days before `to`. */
  @IsOptional()
  @Matches(DATE, { message: 'from must be a date like 2026-10-24' })
  from?: string;

  /** Last day (Pakistan time, inclusive). Default: today. */
  @IsOptional()
  @Matches(DATE, { message: 'to must be a date like 2026-10-24' })
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cityId?: number;

  @IsOptional()
  @IsUUID()
  vendorId?: string;
}

export class ListReportsQueryDto {
  @IsOptional()
  @IsEnum(ReportType)
  type?: ReportType;

  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @IsOptional()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class DownloadQueryDto {
  /** Unix seconds when the link stops working. */
  @Type(() => Number)
  @IsInt()
  exp!: number;

  @Matches(/^[0-9a-f]{64}$/)
  sig!: string;
}
