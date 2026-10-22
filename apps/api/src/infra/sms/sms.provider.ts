export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

/** Provider-agnostic SMS sender (TRD §2.1). Real Pakistani gateway adapters implement this. */
export interface SmsProvider {
  send(toE164: string, message: string): Promise<void>;
}
