export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');

export interface WhatsAppMessage {
  /** E.164 number. */
  to: string;
  /** Pre-approved BSP template name (see templates/whatsapp-templates.ts). */
  templateName: string;
  language: 'en' | 'ur';
  /** Values for the template's numbered placeholders, in order. */
  params: string[];
  /** What the message says, for providers/logs that do not use templates. */
  fallbackText: string;
}

/**
 * Provider-agnostic WhatsApp Business sender (TRD §2.1). A real adapter for the chosen BSP implements this; business
 * initiated messages must use templates the BSP has approved, which is why messages carry a template name.
 */
export interface WhatsAppProvider {
  send(message: WhatsAppMessage): Promise<void>;
}
