import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ComplaintStatus, ComplaintType } from '@prisma/client';

export class ComplaintAttachmentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  publicId!: string;
}

export class CreateComplaintDto {
  /** COMPLAINT is a quality/service issue; REDO asks for the clothes to be cleaned again. */
  @IsOptional()
  @IsEnum(ComplaintType)
  type?: ComplaintType;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  subject!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => ComplaintAttachmentDto)
  attachments?: ComplaintAttachmentDto[];
}

export class ComplaintMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  body!: string;
}

export class ListComplaintsQueryDto {
  @IsOptional()
  @IsEnum(ComplaintStatus)
  status?: ComplaintStatus;

  @IsOptional()
  @IsEnum(ComplaintType)
  type?: ComplaintType;

  /** Admin filter only. */
  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class AssignComplaintDto {
  /** Defaults to the admin making the request. */
  @IsOptional()
  @IsUUID()
  adminId?: string;
}

export const COMPLAINT_OUTCOMES = ['REFUND', 'REDO', 'REJECT'] as const;
export type ComplaintOutcome = (typeof COMPLAINT_OUTCOMES)[number];

export class ResolveComplaintDto {
  @IsIn(COMPLAINT_OUTCOMES)
  outcome!: ComplaintOutcome;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  note?: string;
}
