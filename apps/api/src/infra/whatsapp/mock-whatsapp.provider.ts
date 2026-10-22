import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppMessage, WhatsAppProvider } from './whatsapp.provider';

/** Logs instead of sending. Local/dev only. A number ending in 0000 simulates a provider outage (for tests). */
@Injectable()
export class MockWhatsAppProvider implements WhatsAppProvider {
  private readonly logger = new Logger(MockWhatsAppProvider.name);

  async send(m: WhatsAppMessage): Promise<void> {
    if (m.to.endsWith('0000')) throw new Error('mock whatsapp outage');
    this.logger.warn(`[MOCK WHATSAPP] to=${m.to} template=${m.templateName}/${m.language} text="${m.fallbackText}"`);
  }
}
