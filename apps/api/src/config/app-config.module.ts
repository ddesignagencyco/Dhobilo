import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './env';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Works from the repo root (npm run api:dev) and from apps/api (npm run start:dev).
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
  ],
})
export class AppConfigModule {}
