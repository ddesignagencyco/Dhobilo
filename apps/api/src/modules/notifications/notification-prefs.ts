export interface NotificationPrefs {
  push: boolean;
  whatsapp: boolean;
  sms: boolean;
  email: boolean;
}

export const DEFAULT_PREFS: NotificationPrefs = { push: true, whatsapp: true, sms: true, email: true };

/** Stored JSON may be missing or partial: anything not explicitly switched off is on. */
export function resolvePrefs(stored: unknown): NotificationPrefs {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Partial<Record<keyof NotificationPrefs, unknown>>;
  const pick = (k: keyof NotificationPrefs) => (typeof s[k] === 'boolean' ? (s[k] as boolean) : DEFAULT_PREFS[k]);
  return { push: pick('push'), whatsapp: pick('whatsapp'), sms: pick('sms'), email: pick('email') };
}
