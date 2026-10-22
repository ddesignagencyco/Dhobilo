import { Module } from '@nestjs/common';
import { NotificationOrchestrator } from './notification-orchestrator';

/** Imported by both the API and the worker: order events can originate in either process. */
@Module({ providers: [NotificationOrchestrator], exports: [NotificationOrchestrator] })
export class NotificationOrchestratorModule {}
