import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoggerModule } from 'nestjs-pino';
import { loggerConfig } from './common/logging/logger.config';
import { AppConfigModule } from './config/app-config.module';
import type { Env } from './config/env';
import { CloudinaryModule } from './infra/cloudinary/cloudinary.module';
import { MailModule } from './infra/mail/mail.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { QueueModule } from './infra/queue/queue.module';
import { RedisModule } from './infra/redis/redis.module';
import { AuditModule } from './modules/audit/audit.module';
import { DeliveryWorkerModule } from './modules/delivery/delivery-worker.module';
import { DispatchBootstrap } from './modules/delivery/dispatch.processor';
import { NotificationOrchestratorModule } from './modules/notifications/notification-orchestrator.module';
import { NotificationsWorkerModule } from './modules/notifications/notifications-worker.module';
import { OrderLifecycleModule } from './modules/orders/lifecycle/order-lifecycle.module';
import { OrderTimersBootstrap } from './modules/orders/timers/order-timers.bootstrap';
import { OrderTimersModule } from './modules/orders/timers/order-timers.module';
import { TimeModule } from './common/time/clock';

/**
 * Same codebase as the API, BullMQ processors only (TRD §3). No HTTP listener; module processors are
 * added here as they are built (notifications, order-timers, dispatch, ...).
 */
@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        loggerConfig({ NODE_ENV: config.get('NODE_ENV', { infer: true }), LOG_LEVEL: config.get('LOG_LEVEL', { infer: true }) }),
    }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    RedisModule,
    QueueModule,
    MailModule,
    CloudinaryModule,
    AuditModule,
    TimeModule,
    // Order events can start in the worker (timers), so live-update publishing and notifications run here too.
    OrderLifecycleModule,
    OrderTimersModule,
    NotificationOrchestratorModule,
    NotificationsWorkerModule,
    DeliveryWorkerModule,
  ],
  providers: [OrderTimersBootstrap, DispatchBootstrap],
})
export class WorkerModule {}
