import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import type { Env } from '../../config/env';
import { MailService } from '../../infra/mail/mail.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { SEND_EMAIL_JOB, SEND_PUSH_JOB, SEND_SMS_JOB, SEND_WHATSAPP_JOB } from './notifications.jobs';
import type { SendEmailJob, SendPushJob, SendSmsJob, SendWhatsAppJob } from './notifications.jobs';

const OTP_CODE = /\b(\d{6})\b/;

const ROLE_LABEL: Record<string, string> = {
  CUSTOMER: 'Customer',
  VENDOR_OWNER: 'Vendor owner',
  VENDOR_STAFF: 'Vendor staff',
  RIDER: 'Rider',
  ADMIN: 'Admin',
};

/**
 * Dev/staging testing aid: when NOTIFY_MIRROR_EMAIL is set, every message the worker delivers (OTP codes and all
 * SMS / WhatsApp / push / email notifications) is also emailed to that one inbox, so whole flows can be tested
 * without SMS or WhatsApp providers. Refused in production by the env schema. A mirror failure never affects the
 * real delivery.
 */
@Injectable()
export class NotificationMirror {
  private readonly logger = new Logger(NotificationMirror.name);
  private readonly target: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly mail: MailService,
    private readonly prisma: PrismaService,
  ) {
    this.target = config.get('NOTIFY_MIRROR_EMAIL', { infer: true }) ?? '';
  }

  get enabled(): boolean {
    return this.target.length > 0;
  }

  async mirror(job: Job): Promise<void> {
    if (!this.enabled) return;
    try {
      const message = await this.compose(job);
      if (message) await this.mail.send({ to: this.target, ...message });
    } catch (err) {
      this.logger.warn({ err, jobName: job.name }, 'Could not mirror a notification to the test inbox');
    }
  }

  private async compose(job: Job): Promise<{ subject: string; text: string } | null> {
    switch (job.name) {
      case SEND_SMS_JOB: {
        const d = job.data as SendSmsJob;
        const who = await this.describe(d.to);
        const code = OTP_CODE.exec(d.message)?.[1];
        const isOtp = /code is/i.test(d.message) && !!code;
        return {
          subject: isOtp ? `[Dhoblio dev] Login code ${code} - ${who.role} ${d.to}` : `[Dhoblio dev] SMS to ${d.to}`,
          text: this.body('SMS', d.to, who, d.message, d.requestId),
        };
      }
      case SEND_WHATSAPP_JOB: {
        const d = job.data as SendWhatsAppJob;
        const who = await this.describe(d.to);
        return {
          subject: `[Dhoblio dev] WhatsApp (${d.templateName}) to ${d.to}`,
          text: this.body('WhatsApp', d.to, who, `${d.fallbackText}\n\nTemplate: ${d.templateName} (${d.language})\nParams: ${d.params.join(' | ')}`, d.requestId),
        };
      }
      case SEND_PUSH_JOB: {
        const d = job.data as SendPushJob;
        return {
          subject: `[Dhoblio dev] Push: ${d.title}`,
          text: this.body('Push', `${d.tokens.length} device(s)`, null, `${d.title}\n${d.body}${d.data ? `\n\nData: ${JSON.stringify(d.data)}` : ''}`, d.requestId),
        };
      }
      case SEND_EMAIL_JOB: {
        const d = job.data as SendEmailJob;
        if (d.to.toLowerCase() === this.target.toLowerCase()) return null; // already goes to this inbox
        return { subject: `[Dhoblio dev] Email to ${d.to}: ${d.subject}`, text: this.body('Email', d.to, null, `${d.subject}\n\n${d.text}`, d.requestId) };
      }
      default:
        return null;
    }
  }

  private async describe(phone: string): Promise<{ role: string; name: string | null }> {
    const user = await this.prisma.user.findUnique({ where: { phone }, select: { role: true, name: true } });
    return { role: user ? (ROLE_LABEL[user.role] ?? user.role) : 'Unknown account', name: user?.name ?? null };
  }

  private body(channel: string, to: string, who: { role: string; name: string | null } | null, content: string, requestId?: string): string {
    return [
      'Copy of a message sent by the Dhoblio worker (dev/staging mirror).',
      '',
      `Channel : ${channel}`,
      `To      : ${to}`,
      ...(who ? [`Account : ${who.role}${who.name ? ` - ${who.name}` : ''}`] : []),
      `Sent at : ${new Date().toISOString()}`,
      ...(requestId ? [`Request : ${requestId}`] : []),
      '',
      content,
      '',
    ].join('\n');
  }
}
