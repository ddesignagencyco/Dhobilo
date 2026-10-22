import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { DynamicModule } from '@nestjs/common';
import { QUEUES } from './queues';

/**
 * Bull Board at /admin/queues (TRD §9). Off unless BULL_BOARD_ENABLED=true, and never mounted in production
 * until the admin auth guard from Phase 1 can sit in front of it.
 */
export function bullBoardImports(): DynamicModule[] {
  const enabled = process.env.BULL_BOARD_ENABLED === 'true' && process.env.NODE_ENV !== 'production';
  if (!enabled) return [];
  return [
    BullBoardModule.forRoot({ route: '/admin/queues', adapter: ExpressAdapter }),
    ...Object.values(QUEUES).map((name) => BullBoardModule.forFeature({ name, adapter: BullMQAdapter })),
  ];
}
