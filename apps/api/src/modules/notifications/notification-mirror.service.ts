import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import type { Env } from '../../config/env';
import { MailService } from '../../infra/mail/mail.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { SEND_EMAIL_JOB, SEND_PUSH_JOB, SEND_SMS_JOB, SEND_WHATSAPP_JOB } from './notifications.jobs';
import type { SendEmailJob, SendPushJob, SendSmsJob, SendWhatsAppJob } from './notifications.jobs';
import { esc, renderEmail } from './templates/email';
import type { EmailRole, EmailVars, RenderedEmail } from './templates/email';

const OTP_CODE = /\b(\d{6})\b/;

const ROLE_LABEL: Record<string, string> = {
  CUSTOMER: 'Customer',
  VENDOR_OWNER: 'Vendor owner',
  VENDOR_STAFF: 'Vendor staff',
  RIDER: 'Rider',
  ADMIN: 'Admin',
};

interface Who {
  role: string;
  roleLabel: string;
  name: string | null;
  locale: 'en' | 'ur';
}

/**
 * Dev/staging testing aid: when NOTIFY_MIRROR_EMAIL is set, every message the worker delivers (OTP codes and all
 * SMS / WhatsApp / push / email notifications) is also emailed to that one inbox, as a designed HTML email, so whole
 * flows can be tested without SMS or WhatsApp providers. Refused in production by the env schema. A mirror failure
 * never affects the real delivery.
 */
@Injectable()
export class NotificationMirror {
  private readonly logger = new Logger(NotificationMirror.name);
  private readonly target: string;
  private readonly appUrl: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly mail: MailService,
    private readonly prisma: PrismaService,
  ) {
    this.target = config.get('NOTIFY_MIRROR_EMAIL', { infer: true }) ?? '';
    this.appUrl = config.get('APP_URL', { infer: true }) ?? '';
  }

  get enabled(): boolean {
    return this.target.length > 0;
  }

  async mirror(job: Job): Promise<void> {
    if (!this.enabled) return;
    try {
      const message = await this.compose(job);
      if (message) await this.mail.send({ to: this.target, subject: message.subject, text: message.text, html: message.html });
    } catch (err) {
      this.logger.warn({ err, jobName: job.name }, 'Could not mirror a notification to the test inbox');
    }
  }

  private render(name: Parameters<typeof renderEmail>[0], vars: EmailVars, locale: 'en' | 'ur'): RenderedEmail {
    return renderEmail(name, { ...vars, mirror: true }, locale, { appUrl: this.appUrl });
  }

  private async compose(job: Job): Promise<RenderedEmail | null> {
    switch (job.name) {
      case SEND_SMS_JOB: {
        const d = job.data as SendSmsJob;
        const who = await this.describe(d.to);
        const code = OTP_CODE.exec(d.message)?.[1];
        if (code && /code is/i.test(d.message)) {
          const minutes = Number(/expires in (\d+) minute/i.exec(d.message)?.[1] ?? 5);
          const email = this.render('login_code', { role: who.role as EmailRole, code, minutes, to: d.to, account: who.name ? `${who.roleLabel} - ${who.name}` : who.roleLabel }, who.locale);
          return { ...email, subject: `[Dhoblio dev] ${email.subject} - ${who.roleLabel} ${d.to}` };
        }
        return this.copy('SMS', d.to, who, d.message, d.requestId);
      }
      case SEND_WHATSAPP_JOB: {
        const d = job.data as SendWhatsAppJob;
        const who = await this.describe(d.to);
        return this.copy('WhatsApp', d.to, who, d.fallbackText, d.requestId, [
          { label: 'Template', value: `${d.templateName} (${d.language})` },
          ...(d.params.length ? [{ label: 'Params', value: d.params.join(' | ') }] : []),
        ]);
      }
      case SEND_PUSH_JOB: {
        const d = job.data as SendPushJob;
        return this.copy('Push', `${d.tokens.length} device(s)`, null, `${d.title}\n${d.body}`, d.requestId, d.data ? [{ label: 'Data', value: JSON.stringify(d.data) }] : []);
      }
      case SEND_EMAIL_JOB: {
        const d = job.data as SendEmailJob;
        if (d.to.toLowerCase() === this.target.toLowerCase()) return null; // already goes to this inbox
        if (d.html) {
          return { subject: `[Dhoblio dev] Email to ${d.to}: ${d.subject}`, text: `[Test copy of an email sent to ${d.to}]\n\n${d.text}`, html: injectBanner(d.html, d.to) };
        }
        return this.copy('Email', d.to, null, `${d.subject}\n\n${d.text}`, d.requestId);
      }
      default:
        return null;
    }
  }

  private copy(channel: string, to: string, who: Who | null, content: string, requestId?: string, details: { label: string; value: string }[] = []): RenderedEmail {
    const email = this.render(
      'message_copy',
      {
        channel,
        to,
        account: who ? (who.name ? `${who.roleLabel} - ${who.name}` : who.roleLabel) : undefined,
        content,
        details: [...details, ...(requestId ? [{ label: 'Request', value: requestId }] : [])],
        sentAt: `${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' })} PKT`,
      },
      'en',
    );
    return { ...email, subject: `[Dhoblio dev] ${channel} to ${to}` };
  }

  private async describe(phone: string): Promise<Who> {
    const user = await this.prisma.user.findUnique({ where: { phone }, select: { role: true, name: true, locale: true } });
    const role = user?.role ?? 'UNKNOWN';
    return { role, roleLabel: user ? (ROLE_LABEL[user.role] ?? user.role) : 'Unknown account', name: user?.name ?? null, locale: user?.locale === 'UR' ? 'ur' : 'en' };
  }
}

/** Puts a small "test copy" strip at the top of an email that is forwarded unchanged. */
function injectBanner(html: string, to: string): string {
  const banner = `<div style="background:#fef3c7;color:#78350f;font-family:Arial,sans-serif;font-size:12px;line-height:1.5;padding:8px 14px;text-align:center;"><strong>Test copy</strong> &middot; originally sent to ${esc(to)}</div>`;
  return html.replace(/<body[^>]*>/i, (m) => `${m}${banner}`);
}
