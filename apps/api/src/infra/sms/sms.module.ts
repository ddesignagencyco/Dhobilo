import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { MockSmsProvider } from './mock-sms.provider';
import { SMS_PROVIDER, SmsProvider } from './sms.provider';

/** Picks the adapter from SMS_PROVIDER. Add real gateway adapters here; unknown values fail the worker's boot. */
@Module({
  providers: [
    MockSmsProvider,
    {
      provide: SMS_PROVIDER,
      inject: [ConfigService, MockSmsProvider],
      useFactory: (config: ConfigService<Env, true>, mock: MockSmsProvider): SmsProvider => {
        const name = config.get('SMS_PROVIDER', { infer: true });
        switch (name) {
          case 'mock':
            return mock;
          default:
            throw new Error(`Unsupported SMS_PROVIDER "${name}" (available: mock)`);
        }
      },
    },
  ],
  exports: [SMS_PROVIDER],
})
export class SmsModule {}
