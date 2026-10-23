export type TemplateLocale = 'en' | 'ur';

export type TemplateName =
  | 'order_placed'
  | 'order_accepted'
  | 'order_rejected'
  | 'order_cancelled'
  | 'order_picked_up'
  | 'order_in_process'
  | 'order_ready'
  | 'order_out_for_delivery'
  | 'order_delivered'
  | 'vendor_new_order'
  | 'vendor_order_cancelled'
  | 'vendor_order_expired'
  | 'order_rider_assigned'
  | 'delivery_code'
  | 'rider_job_offer'
  | 'rider_job_assigned'
  | 'rider_job_cancelled'
  | 'order_refunded';

export interface TemplateParams {
  orderNo: string;
  vendor?: string;
  reason?: string;
  items?: number;
  total?: string;
  minutes?: number;
  /** Rider's name, shown to customers. */
  rider?: string;
  /** The 4-digit delivery code. */
  code?: string;
  /** Which leg a rider job is. Written out in the reader's language when rendered. */
  jobType?: 'pickup' | 'delivery';
}

const JOB_WORDS: Record<NonNullable<TemplateParams['jobType']>, Record<TemplateLocale, string>> = {
  pickup: { en: 'pickup', ur: 'پک اپ' },
  delivery: { en: 'delivery', ur: 'ڈیلیوری' },
};

interface Text {
  title: string;
  body: string;
}

/**
 * Message texts, versioned in code (TRD §14). `{name}` placeholders are filled from TemplateParams. Every template
 * exists in both languages; the unit tests fail if one is missing or leaves a placeholder unfilled.
 */
export const ORDER_TEMPLATES: Record<TemplateName, Record<TemplateLocale, Text>> = {
  order_placed: {
    en: { title: 'Order placed', body: 'Your order {orderNo} was sent to {vendor}. Waiting for them to confirm.' },
    ur: { title: 'آرڈر بھیج دیا گیا', body: 'آپ کا آرڈر {orderNo} {vendor} کو بھیج دیا گیا ہے۔ ان کی تصدیق کا انتظار ہے۔' },
  },
  order_accepted: {
    en: { title: 'Order accepted', body: '{vendor} accepted your order {orderNo}.' },
    ur: { title: 'آرڈر قبول ہو گیا', body: '{vendor} نے آپ کا آرڈر {orderNo} قبول کر لیا ہے۔' },
  },
  order_rejected: {
    en: { title: 'Order not accepted', body: 'Sorry, {vendor} could not take your order {orderNo}. {reason}' },
    ur: { title: 'آرڈر قبول نہیں ہوا', body: 'معذرت، {vendor} آپ کا آرڈر {orderNo} قبول نہیں کر سکا۔ {reason}' },
  },
  order_cancelled: {
    en: { title: 'Order cancelled', body: 'Order {orderNo} was cancelled. {reason}' },
    ur: { title: 'آرڈر منسوخ', body: 'آرڈر {orderNo} منسوخ کر دیا گیا ہے۔ {reason}' },
  },
  order_picked_up: {
    en: { title: 'Clothes picked up', body: 'Your clothes for order {orderNo} have been picked up.' },
    ur: { title: 'کپڑے وصول ہو گئے', body: 'آرڈر {orderNo} کے آپ کے کپڑے وصول کر لیے گئے ہیں۔' },
  },
  order_in_process: {
    en: { title: 'Work started', body: '{vendor} started working on your order {orderNo}.' },
    ur: { title: 'کام شروع ہو گیا', body: '{vendor} نے آپ کے آرڈر {orderNo} پر کام شروع کر دیا ہے۔' },
  },
  order_ready: {
    en: { title: 'Order ready', body: 'Your order {orderNo} is ready and will be delivered soon.' },
    ur: { title: 'آرڈر تیار ہے', body: 'آپ کا آرڈر {orderNo} تیار ہے اور جلد ڈیلیور کیا جائے گا۔' },
  },
  order_out_for_delivery: {
    en: { title: 'Out for delivery', body: 'Your order {orderNo} is on its way to you.' },
    ur: { title: 'ڈیلیوری کے لیے روانہ', body: 'آپ کا آرڈر {orderNo} آپ کی طرف روانہ ہو گیا ہے۔' },
  },
  order_delivered: {
    en: { title: 'Order delivered', body: 'Your order {orderNo} was delivered. Thank you for using Dhoblio!' },
    ur: { title: 'آرڈر ڈیلیور ہو گیا', body: 'آپ کا آرڈر {orderNo} ڈیلیور ہو گیا ہے۔ ڈھوبلیو استعمال کرنے کا شکریہ!' },
  },
  vendor_new_order: {
    en: { title: 'New order', body: 'New order {orderNo}: {items} item(s), Rs {total}. Please respond within {minutes} min.' },
    ur: { title: 'نیا آرڈر', body: 'نیا آرڈر {orderNo}: {items} آئٹم، Rs {total}۔ براہ کرم {minutes} منٹ میں جواب دیں۔' },
  },
  vendor_order_cancelled: {
    en: { title: 'Order cancelled', body: 'Order {orderNo} was cancelled. {reason}' },
    ur: { title: 'آرڈر منسوخ', body: 'آرڈر {orderNo} منسوخ کر دیا گیا ہے۔ {reason}' },
  },
  vendor_order_expired: {
    en: { title: 'Order expired', body: 'Order {orderNo} was rejected automatically because it was not answered in time.' },
    ur: { title: 'آرڈر کی مدت ختم', body: 'آرڈر {orderNo} بروقت جواب نہ ملنے کی وجہ سے خود بخود مسترد ہو گیا۔' },
  },
  order_rider_assigned: {
    en: { title: 'Rider assigned', body: '{rider} will handle the {jobType} for your order {orderNo}.' },
    ur: { title: 'رائیڈر مقرر', body: 'آپ کے آرڈر {orderNo} کی {jobType} {rider} کریں گے۔' },
  },
  delivery_code: {
    en: { title: 'Your delivery code', body: 'Order {orderNo}: your delivery code is {code}. Give it to the rider only when you have your clothes.' },
    ur: { title: 'آپ کا ڈیلیوری کوڈ', body: 'آرڈر {orderNo}: آپ کا ڈیلیوری کوڈ {code} ہے۔ یہ کوڈ رائیڈر کو صرف کپڑے ملنے پر دیں۔' },
  },
  rider_job_offer: {
    en: { title: 'New {jobType} job', body: 'New {jobType} job for order {orderNo}. Open the app and accept within {minutes} min.' },
    ur: { title: 'نیا {jobType} کام', body: 'آرڈر {orderNo} کی نئی {jobType}۔ ایپ کھولیں اور {minutes} منٹ میں قبول کریں۔' },
  },
  rider_job_assigned: {
    en: { title: 'Job assigned to you', body: 'You were given the {jobType} job for order {orderNo}.' },
    ur: { title: 'آپ کو کام سونپا گیا', body: 'آپ کو آرڈر {orderNo} کی {jobType} سونپی گئی ہے۔' },
  },
  order_refunded: {
    en: { title: 'Refund on its way', body: 'Rs {total} for order {orderNo} is being refunded to your payment method.' },
    ur: { title: 'رقم کی واپسی', body: 'آرڈر {orderNo} کے Rs {total} آپ کے ادائیگی کے طریقے پر واپس کیے جا رہے ہیں۔' },
  },
  rider_job_cancelled: {
    en: { title: 'Job cancelled', body: 'The {jobType} job for order {orderNo} is no longer yours. {reason}' },
    ur: { title: 'کام منسوخ', body: 'آرڈر {orderNo} کی {jobType} اب آپ کے ذمے نہیں۔ {reason}' },
  },
};

export function renderTemplate(name: TemplateName, locale: TemplateLocale, params: TemplateParams): Text & { values: string[] } {
  const fill = (text: string) =>
    text
      .replace(/\{(\w+)\}/g, (_m, key: keyof TemplateParams) =>
        key === 'jobType' ? (params.jobType ? JOB_WORDS[params.jobType][locale] : '') : String(params[key] ?? ''),
      )
      .replace(/\s+/g, ' ')
      .trim();
  const t = ORDER_TEMPLATES[name][locale];
  return { title: fill(t.title), body: fill(t.body), values: Object.keys(params).map((k) => String(params[k as keyof TemplateParams] ?? '')) };
}
