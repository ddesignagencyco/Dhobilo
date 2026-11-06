import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { Env } from '../../config/env';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { QUEUES } from '../../infra/queue/queues';
import { resolvePrefs } from './notification-prefs';
import { rs } from './order-email-data';
import { SEND_EMAIL_JOB, SEND_SMS_JOB, SendEmailJob, SendSmsJob } from './notifications.jobs';
import { DEFAULT_APP_URL, renderEmail } from './templates/email';
import type { PayoutKind } from './templates/email';

export type VendorDecision = 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'REACTIVATED';

interface Recipient {
  phone: string;
  email?: string | null;
  /** The recipient's language; English when unknown. */
  locale?: 'EN' | 'UR' | null;
}

const lang = (r: Recipient) => (r.locale === 'UR' ? 'ur' : 'en');

/** What the payout email needs from a payout row. */
export interface PayoutForEmail {
  vendorId: string;
  amount: { toString(): string };
  method: string;
  accountRef: string;
  txnRef?: string | null;
  note?: string | null;
}

/** Plain-English decision texts. Per-locale (en/ur) templates arrive with the Phase 4 notifications orchestrator. */
export function vendorDecisionMessage(businessName: string, decision: VendorDecision, reason?: string) {
  const why = reason ? ` Reason: ${reason}` : '';
  switch (decision) {
    case 'APPROVED':
      return {
        subject: 'Your Dhoblio vendor account is approved',
        text: `Good news: ${businessName} is approved on Dhoblio. Sign in to set up your catalog and opening hours.`,
        sms: `Dhoblio: ${businessName} is approved. Sign in to set up your catalog.`,
      };
    case 'REJECTED':
      return {
        subject: 'Your Dhoblio vendor application needs changes',
        text: `We could not approve ${businessName} yet.${why} You can fix the details and resubmit from your account.`,
        sms: `Dhoblio: ${businessName} was not approved.${why} Sign in to resubmit.`,
      };
    case 'SUSPENDED':
      return {
        subject: 'Your Dhoblio vendor account is suspended',
        text: `${businessName} has been suspended and will not receive orders.${why} Contact support for help.`,
        sms: `Dhoblio: ${businessName} is suspended.${why}`,
      };
    case 'REACTIVATED':
      return {
        subject: 'Your Dhoblio vendor account is active again',
        text: `${businessName} has been reactivated. Set your availability to Open to receive orders again.`,
        sms: `Dhoblio: ${businessName} is active again.`,
      };
  }
}

/** Plain-English rider decision texts (riders get an SMS; per-locale templates can follow when riders have a language setting). */
export function riderDecisionMessage(decision: VendorDecision, reason?: string): string {
  const why = reason ? ` Reason: ${reason}` : '';
  switch (decision) {
    case 'APPROVED':
      return 'Dhoblio: your rider account is approved. Sign in, go online and start taking jobs.';
    case 'REJECTED':
      return `Dhoblio: we could not approve your rider application.${why} Sign in to fix the details and resubmit.`;
    case 'SUSPENDED':
      return `Dhoblio: your rider account is suspended.${why} Contact support for help.`;
    case 'REACTIVATED':
      return 'Dhoblio: your rider account is active again. Go online to take jobs.';
  }
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectQueue(QUEUES.NOTIFICATIONS) private readonly queue: Queue,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly config?: ConfigService<Env, true>,
  ) {}

  private get appUrl(): string {
    return this.config?.get('APP_URL', { infer: true }) ?? DEFAULT_APP_URL;
  }

  /**
   * Tells a vendor owner about an admin decision by email (if known) and SMS. Never throws: the decision is
   * already committed, so a queue outage must not turn it into an API error.
   */
  async notifyVendorDecision(to: Recipient, businessName: string, decision: VendorDecision, reason?: string, requestId?: string) {
    const msg = vendorDecisionMessage(businessName, decision, reason);
    try {
      const jobs: Promise<unknown>[] = [
        this.queue.add(SEND_SMS_JOB, { to: to.phone, message: msg.sms, requestId } satisfies SendSmsJob),
      ];
      if (to.email) {
        const email = renderEmail('vendor_decision', { name: businessName, decision, reason }, lang(to), { appUrl: this.appUrl });
        jobs.push(this.queue.add(SEND_EMAIL_JOB, { to: to.email, subject: email.subject, text: email.text, html: email.html, requestId } satisfies SendEmailJob));
      }
      await Promise.all(jobs);
    } catch (err) {
      this.logger.error({ err, decision, requestId }, 'Could not enqueue vendor decision notifications');
    }
  }

  /** Tells a rider about an admin decision by SMS, and by email when they have one. Never throws, for the same reason as notifyVendorDecision. */
  async notifyRiderDecision(to: Recipient, decision: VendorDecision, reason?: string, requestId?: string) {
    try {
      const jobs: Promise<unknown>[] = [this.queue.add(SEND_SMS_JOB, { to: to.phone, message: riderDecisionMessage(decision, reason), requestId } satisfies SendSmsJob)];
      if (to.email) {
        const email = renderEmail('rider_decision', { decision, reason }, lang(to), { appUrl: this.appUrl });
        jobs.push(this.queue.add(SEND_EMAIL_JOB, { to: to.email, subject: email.subject, text: email.text, html: email.html, requestId } satisfies SendEmailJob));
      }
      await Promise.all(jobs);
    } catch (err) {
      this.logger.error({ err, decision, requestId }, 'Could not enqueue rider decision notification');
    }
  }

  /**
   * Emails the vendor owner about a payout (requested, approved, paid or rejected), if they have an email address
   * and allow email. Never throws: the payout change is already committed.
   */
  async notifyPayout(payout: PayoutForEmail, kind: PayoutKind, requestId?: string) {
    if (!this.prisma) return;
    try {
      const vendor = await this.prisma.vendor.findUnique({
        where: { id: payout.vendorId },
        select: { businessName: true, owner: { select: { email: true, locale: true, notificationPrefs: true } } },
      });
      const owner = vendor?.owner;
      if (!vendor || !owner?.email || !resolvePrefs(owner.notificationPrefs).email) return;
      const email = renderEmail(
        'vendor_payout',
        {
          vendor: vendor.businessName,
          payout: {
            kind,
            amount: rs(payout.amount),
            method: owner.locale === 'UR' ? (payout.method === 'WALLET' ? 'موبائل والیٹ' : 'بینک ٹرانسفر') : payout.method === 'WALLET' ? 'Mobile wallet' : 'Bank transfer',
            accountRef: `\u2022\u2022\u2022\u2022${payout.accountRef.slice(-4)}`,
            txnRef: payout.txnRef ?? undefined,
            note: kind === 'REJECTED' ? (payout.note ?? undefined) : undefined,
          },
        },
        owner.locale === 'UR' ? 'ur' : 'en',
        { appUrl: this.appUrl },
      );
      await this.queue.add(SEND_EMAIL_JOB, { to: owner.email, subject: email.subject, text: email.text, html: email.html, requestId } satisfies SendEmailJob);
    } catch (err) {
      this.logger.error({ err, kind, requestId }, 'Could not enqueue a payout email');
    }
  }

  /** A plain SMS for flows that do not need a localized template. Never throws. */
  async notifySms(to: string, message: string, requestId?: string) {
    try {
      await this.queue.add(SEND_SMS_JOB, { to, message, requestId } satisfies SendSmsJob);
    } catch (err) {
      this.logger.error({ err, requestId }, 'Could not enqueue an SMS');
    }
  }
}
