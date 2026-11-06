export type EmailLocale = 'en' | 'ur';

export type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'info';

export interface OrderCardData {
  orderNo: string;
  shop?: string;
  items?: { name: string; qty: number; amount: string }[];
  /** Used when the line items are not known (e.g. vendor alerts). */
  itemCount?: number;
  subtotal?: string;
  deliveryFee?: string;
  discount?: string;
  total?: string;
  pickup?: string;
  delivery?: string;
  address?: string;
  payment?: string;
  note?: string;
}

export type Block =
  | { t: 'p'; text: string; muted?: boolean }
  | { t: 'code'; code: string; caption?: string }
  /** A big highlighted figure, e.g. a payout amount. */
  | { t: 'stat'; label: string; value: string; hint?: string }
  | { t: 'kv'; rows: { label: string; value: string; mono?: boolean }[] }
  | { t: 'order'; order: OrderCardData }
  /** `step` is the current step (0-based); steps before it are done, `5` means everything is done. */
  | { t: 'tracker'; step: number }
  | { t: 'notice'; tone: Tone; title?: string; text: string }
  | { t: 'list'; title?: string; items: string[] };

/** A finished email before rendering: both the HTML and the plain-text version are built from this. */
export interface EmailModel {
  subject: string;
  /** Hidden inbox-preview line. */
  preheader: string;
  tone: Tone;
  /** Small status pill in the hero. */
  badge?: string;
  title: string;
  subtitle?: string;
  blocks: Block[];
  cta?: { label: string; url: string };
  /** "You received this because..." line in the footer. */
  reason: string;
  /** Set on test-inbox copies: adds a clear banner so nobody mistakes a mirror for the real message. */
  mirror?: boolean;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface RenderContext {
  /** Public base URL of the web app, used for buttons. */
  appUrl: string;
}
