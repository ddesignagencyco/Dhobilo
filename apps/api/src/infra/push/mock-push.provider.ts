import { Injectable, Logger } from '@nestjs/common';
import { PushMessage, PushProvider, PushResult } from './push.provider';

/** Logs instead of sending. Tokens starting with "invalid-" behave like unregistered devices (for tests). */
@Injectable()
export class MockPushProvider implements PushProvider {
  private readonly logger = new Logger(MockPushProvider.name);

  async send(token: string, m: PushMessage): Promise<PushResult> {
    if (token.startsWith('invalid-')) return { ok: false, invalidToken: true, error: 'UNREGISTERED' };
    this.logger.warn(`[MOCK PUSH] token=${token.slice(0, 12)}… title="${m.title}" body="${m.body}"`);
    return { ok: true };
  }
}
