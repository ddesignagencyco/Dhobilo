import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import type { Env } from '../../config/env';

export interface MailMessage {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
}

/** Nodemailer transport: MailHog locally, Google SMTP (app password) in staging/prod, chosen purely by env. */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter;
  private readonly from: string;

  constructor(config: ConfigService<Env, true>) {
    const host = config.get('SMTP_HOST', { infer: true });
    const port = config.get('SMTP_PORT', { infer: true });
    const user = config.get('SMTP_USER', { infer: true });
    const pass = config.get('SMTP_PASS', { infer: true });
    this.from = config.get('SMTP_FROM', { infer: true });
    this.transport = createTransport({
      host,
      port,
      secure: port === 465,
      auth: user ? { user, pass } : undefined,
    });
  }

  async send(message: MailMessage): Promise<{ messageId: string }> {
    const info = await this.transport.sendMail({ from: this.from, ...message });
    this.logger.log({ messageId: info.messageId, subject: message.subject }, 'Email sent');
    return { messageId: info.messageId };
  }
}
