/** Job names and payloads of the `notifications` queue. Kept apart from the processor so producers can use them without importing it. */
export const SEND_SMS_JOB = 'send-sms';
export const SEND_EMAIL_JOB = 'send-email';
export const SEND_WHATSAPP_JOB = 'send-whatsapp';
export const SEND_PUSH_JOB = 'send-push';

/** Present on jobs created by the orchestrator; lets delivery update the user's Notification log row. */
interface Logged {
  notificationId?: string;
  requestId?: string;
}

export interface SendSmsJob extends Logged {
  to: string;
  message: string;
}

export interface SendEmailJob extends Logged {
  to: string;
  subject: string;
  text: string;
}

export interface SendWhatsAppJob extends Logged {
  to: string;
  templateName: string;
  language: 'en' | 'ur';
  params: string[];
  fallbackText: string;
  /** On final failure, send fallbackText by SMS instead (TRD §9), if the user allows SMS. */
  fallbackSms?: boolean;
  userId?: string;
}

export interface SendPushJob extends Logged {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}
