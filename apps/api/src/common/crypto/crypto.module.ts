import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { FieldCrypto, parseKeyList } from './field-crypto';

export function fieldCryptoFromEnv(env: Pick<Env, 'ENC_KEY_ID' | 'ENC_KEY_BASE64' | 'ENC_PREVIOUS_KEYS' | 'HMAC_KEY_BASE64'>): FieldCrypto {
  const keys = {
    ...parseKeyList(env.ENC_PREVIOUS_KEYS),
    [env.ENC_KEY_ID]: Buffer.from(env.ENC_KEY_BASE64, 'base64'),
  };
  return new FieldCrypto({ currentId: env.ENC_KEY_ID, keys }, Buffer.from(env.HMAC_KEY_BASE64, 'base64'));
}

@Global()
@Module({
  providers: [
    {
      provide: FieldCrypto,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        fieldCryptoFromEnv({
          ENC_KEY_ID: config.get('ENC_KEY_ID', { infer: true }),
          ENC_KEY_BASE64: config.get('ENC_KEY_BASE64', { infer: true }),
          ENC_PREVIOUS_KEYS: config.get('ENC_PREVIOUS_KEYS', { infer: true }),
          HMAC_KEY_BASE64: config.get('HMAC_KEY_BASE64', { infer: true }),
        }),
    },
  ],
  exports: [FieldCrypto],
})
export class CryptoModule {}
