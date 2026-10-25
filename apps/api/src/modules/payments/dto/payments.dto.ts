import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class InitiatePaymentDto {
  /** The order to pay. Its payment method decides the gateway; card details are never sent to us. */
  @IsUUID()
  orderId!: string;
}

export class RefundPaymentDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
