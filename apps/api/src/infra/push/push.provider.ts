export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');

export interface PushMessage {
  title: string;
  body: string;
  /** Extra key/values for the app (all strings), e.g. orderId and status for deep links. */
  data?: Record<string, string>;
}

export type PushResult =
  | { ok: true }
  /** `invalidToken` = the device is gone or the token is malformed: delete it, never retry it. */
  | { ok: false; invalidToken: boolean; error: string };

/** Sends one push message to one device token. Transient failures are thrown so the queue retries. */
export interface PushProvider {
  send(token: string, message: PushMessage): Promise<PushResult>;
}
