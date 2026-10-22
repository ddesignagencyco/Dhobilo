import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { MockWhatsAppProvider } from './mock-whatsapp.provider';
import { WHATSAPP_PROVIDER, WhatsAppProvider } from './whatsapp.provider';

/** Picks the adapter from WHATSAPP_PROVIDER. Real BSP adapters go here; unknown values fail the worker's boot. */
@Module({
  providers: [
    MockWhatsAppProvider,
    {
      provide: WHATSAPP_PROVIDER,
      inject: [ConfigService, MockWhatsAppProvider],
      useFactory: (config: ConfigService<Env, true>, mock: MockWhatsAppProvider): WhatsAppProvider => {
        const name = config.get('WHATSAPP_PROVIDER', { infer: true });
        switch (name) {
          case 'mock':
            return mock;
          default:
            throw new Error(`Unsupported WHATSAPP_PROVIDER "${name}" (available: mock)`);
        }
      },
    },
  ],
  exports: [WHATSAPP_PROVIDER],
})
export class WhatsAppModule {}
