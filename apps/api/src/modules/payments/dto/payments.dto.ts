import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class PayOrderDto {
  /** Pay with a different online method this time. Defaults to the one chosen at checkout. */
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;
}

export class ListPaymentsQueryDto {
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  orderNo?: string;

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

export class RefundPaymentDto {
  @Transform(trim)
  @IsString()
  @Length(3, 300)
  reason!: string;
}
