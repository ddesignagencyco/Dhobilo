import { Global, Module } from '@nestjs/common';
import { DevMailController } from './dev-mail.controller';
import { MailService } from './mail.service';

const isProd = process.env.NODE_ENV === 'production';

@Global()
@Module({
  controllers: isProd ? [] : [DevMailController],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
