import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class ReviewInputDto {
  /** 1 to 5 stars. */
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  comment?: string;
}

export class CreateReviewDto {
  /** Review the vendor's service. Omit it to rate only the rider. */
  @IsOptional()
  @ValidateNested()
  @Type(() => ReviewInputDto)
  vendor?: ReviewInputDto;

  /** Review the rider who delivered. Omit it to rate only the vendor. */
  @IsOptional()
  @ValidateNested()
  @Type(() => ReviewInputDto)
  rider?: ReviewInputDto;
}

export class ListVendorReviewsQueryDto {
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
