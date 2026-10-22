import { Injectable, Logger } from '@nestjs/common';
import { SmsProvider } from './sms.provider';

/** Logs the message instead of sending it. Local/dev only: the log line contains the OTP. */
@Injectable()
export class MockSmsProvider implements SmsProvider {
  private readonly logger = new Logger(MockSmsProvider.name);

  async send(toE164: string, message: string): Promise<void> {
    this.logger.warn(`[MOCK SMS] to=${toE164} message="${message}"`);
  }
}
