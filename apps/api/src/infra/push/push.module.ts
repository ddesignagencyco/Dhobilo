import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { FcmPushProvider } from './fcm-push.provider';
import { MockPushProvider } from './mock-push.provider';
import { PUSH_PROVIDER, PushProvider } from './push.provider';

/** PUSH_PROVIDER=mock (default) logs; PUSH_PROVIDER=fcm sends through Firebase (needs the FCM_* settings). */
@Module({
  providers: [
    MockPushProvider,
    {
      provide: PUSH_PROVIDER,
      inject: [ConfigService, MockPushProvider],
      useFactory: (config: ConfigService<Env, true>, mock: MockPushProvider): PushProvider => {
        const name = config.get('PUSH_PROVIDER', { infer: true });
        if (name === 'mock') return mock;
        return new FcmPushProvider({
          projectId: config.get('FCM_PROJECT_ID', { infer: true }),
          clientEmail: config.get('FCM_CLIENT_EMAIL', { infer: true }),
          privateKey: config.get('FCM_PRIVATE_KEY', { infer: true }),
        });
      },
    },
  ],
  exports: [PUSH_PROVIDER],
})
export class PushModule {}
