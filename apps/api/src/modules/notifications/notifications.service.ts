import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUES } from '../../infra/queue/queues';
import { SEND_EMAIL_JOB, SEND_SMS_JOB, SendEmailJob, SendSmsJob } from './notifications.processor';

export type VendorDecision = 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'REACTIVATED';

interface Recipient {
  phone: string;
  email?: string | null;
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

  constructor(@InjectQueue(QUEUES.NOTIFICATIONS) private readonly queue: Queue) {}

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
        jobs.push(this.queue.add(SEND_EMAIL_JOB, { to: to.email, subject: msg.subject, text: msg.text, requestId } satisfies SendEmailJob));
      }
      await Promise.all(jobs);
    } catch (err) {
      this.logger.error({ err, decision, requestId }, 'Could not enqueue vendor decision notifications');
    }
  }

  /** Tells a rider about an admin decision by SMS. Never throws, for the same reason as notifyVendorDecision. */
  async notifyRiderDecision(to: Recipient, decision: VendorDecision, reason?: string, requestId?: string) {
    try {
      await this.queue.add(SEND_SMS_JOB, { to: to.phone, message: riderDecisionMessage(decision, reason), requestId } satisfies SendSmsJob);
    } catch (err) {
      this.logger.error({ err, decision, requestId }, 'Could not enqueue rider decision notification');
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
