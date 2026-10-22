import { Body, Controller, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBody, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { CourierService } from './courier.service';

/** Only for the API docs: each partner's real payload is checked by its own adapter, so the handler takes `unknown`. */
class CourierWebhookBody {
  @ApiProperty({ description: 'Unique id of this notification. Repeating it is safe.', example: 'evt-20261024-0001' })
  eventId!: string;

  @ApiProperty({ description: 'The tracking reference we got when we handed the job over.', example: 'MOCK-2E8F4C6B' })
  trackingRef!: string;

  @ApiProperty({ enum: ['IN_TRANSIT', 'COMPLETED', 'FAILED'] })
  status!: 'IN_TRANSIT' | 'COMPLETED' | 'FAILED';

  @ApiPropertyOptional({ description: 'Why it failed.', example: 'Nobody home' })
  reason?: string;
}

/** Where courier partners report progress. No login: the partner proves itself with a signature on each call. */
@ApiTags('webhooks')
@Public()
@Controller('webhooks/courier')
export class CourierWebhookController {
  constructor(private readonly courier: CourierService) {}

  /**
   * Status update from a courier partner (`IN_TRANSIT`, `COMPLETED` or `FAILED`) for a job we gave them. Each call
   * carries a unique `eventId`; repeating an `eventId` is safe and changes nothing (`duplicate: true`).
   */
  @Post(':code')
  @HttpCode(200)
  @ApiBody({ type: CourierWebhookBody })
  receive(@Param('code') code: string, @Headers() headers: Record<string, string | string[] | undefined>, @Body() body: unknown) {
    return this.courier.handleWebhook(code, headers, body);
  }
}
