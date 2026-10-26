import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoggerModule } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { loggerConfig } from './common/logging/logger.config';
import { createValidationPipe } from './common/pipes/validation.pipe';
import { AppConfigModule } from './config/app-config.module';
import type { Env } from './config/env';
import { CloudinaryModule } from './infra/cloudinary/cloudinary.module';
import { MailModule } from './infra/mail/mail.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { bullBoardImports } from './infra/queue/bull-board.module';
import { QueueModule } from './infra/queue/queue.module';
import { RedisModule } from './infra/redis/redis.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { TimeModule } from './common/time/clock';
import { AddressesModule } from './modules/addresses/addresses.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AnnouncementsModule } from './modules/announcements/announcements.module';
import { AuditQueryModule } from './modules/audit/audit-query.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AdminModule } from './modules/admin/admin.module';
import { CartModule } from './modules/cart/cart.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { ComplaintsModule } from './modules/complaints/complaints.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { DiscoveryModule } from './modules/discovery/discovery.module';
import { FinanceModule } from './modules/finance/finance.module';
import { MediaModule } from './modules/media/media.module';
import { NotificationOrchestratorModule } from './modules/notifications/notification-orchestrator.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OpsModule } from './modules/ops/ops.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PromotionsHttpModule } from './modules/promos/promotions-http.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { SlotsModule } from './modules/slots/slots.module';
import { VendorsModule } from './modules/vendors/vendors.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CitiesModule } from './modules/cities/cities.module';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';

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
    ...bullBoardImports(),
    MailModule,
    CloudinaryModule,
    TimeModule,
    CryptoModule,
    NotificationsModule,
    NotificationOrchestratorModule,
    AuditModule,
    HealthModule,
    AuthModule,
    UsersModule,
    CitiesModule,
    AddressesModule,
    MediaModule,
    VendorsModule,
    CatalogModule,
    AdminModule,
    DiscoveryModule,
    SlotsModule,
    CartModule,
    FinanceModule,
    OrdersModule,
    PaymentsModule,
    DeliveryModule,
    PromotionsHttpModule,
    ReviewsModule,
    ComplaintsModule,
    AnalyticsModule,
    ReportsModule,
    AnnouncementsModule,
    AuditQueryModule,
    OpsModule,
  ],
  providers: [
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
  ],
})
export class AppModule {}
