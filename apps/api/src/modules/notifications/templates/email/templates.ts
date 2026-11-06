import type { EmailLocale, EmailModel, OrderCardData, RenderContext, Tone } from './model';

export type EmailRole = 'CUSTOMER' | 'VENDOR_OWNER' | 'VENDOR_STAFF' | 'RIDER' | 'ADMIN';
export type Decision = 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'REACTIVATED';
export type PayoutKind = 'REQUESTED' | 'APPROVED' | 'PAID' | 'REJECTED';

export interface EmailVars {
  /** Sign-in code emails. */
  role?: EmailRole;
  code?: string;
  minutes?: number;
  /** Order emails. */
  orderNo?: string;
  orderId?: string;
  vendor?: string;
  reason?: string;
  rider?: string;
  jobType?: 'pickup' | 'delivery';
  order?: OrderCardData;
  /** Vendor and rider application decisions. */
  decision?: Decision;
  name?: string;
  payout?: { kind: PayoutKind; amount: string; method?: string; accountRef?: string; txnRef?: string; note?: string };
  /** Announcements. */
  title?: string;
  body?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  /** Test-inbox copies. */
  channel?: string;
  to?: string;
  account?: string;
  content?: string;
  details?: { label: string; value: string }[];
  sentAt?: string;
  mirror?: boolean;
}

export type EmailTemplateName =
  | 'login_code'
  | 'order_placed'
  | 'order_accepted'
  | 'order_rejected'
  | 'order_cancelled'
  | 'order_picked_up'
  | 'order_in_process'
  | 'order_ready'
  | 'order_out_for_delivery'
  | 'order_delivered'
  | 'order_rider_assigned'
  | 'vendor_new_order'
  | 'vendor_order_cancelled'
  | 'vendor_order_expired'
  | 'vendor_decision'
  | 'vendor_payout'
  | 'rider_decision'
  | 'rider_job_offer'
  | 'rider_job_assigned'
  | 'rider_job_cancelled'
  | 'announcement'
  | 'message_copy';

interface Def {
  label: string;
  build: (v: EmailVars, locale: EmailLocale, ctx: RenderContext) => EmailModel;
  sample: EmailVars;
}

const ROLE_LABEL: Record<EmailRole, { en: string; ur: string }> = {
  CUSTOMER: { en: 'Customer', ur: 'کسٹمر' },
  VENDOR_OWNER: { en: 'Shop owner', ur: 'دکان کے مالک' },
  VENDOR_STAFF: { en: 'Shop staff', ur: 'دکان کا عملہ' },
  RIDER: { en: 'Rider', ur: 'رائیڈر' },
  ADMIN: { en: 'Admin', ur: 'ایڈمن' },
};

/** Picks the text for the reader's language. */
const pick = (locale: EmailLocale) => (en: string, ur: string) => (locale === 'ur' ? ur : en);

/** Keeps Latin tokens (order numbers, amounts, shop names) in order inside right-to-left sentences. */
const isolate = (locale: EmailLocale) => (s: string | number | undefined) => (locale === 'ur' ? `⁦${s ?? ''}⁩` : String(s ?? ''));

const link = (ctx: RenderContext, locale: EmailLocale, path: string) => `${ctx.appUrl.replace(/\/$/, '')}/${locale}${path}`;

const REASONS = {
  customer: { en: 'You received this because you placed an order on Dhoblio.', ur: 'آپ کو یہ ای میل اس لیے ملی کہ آپ نے ڈھوبلیو پر آرڈر کیا تھا۔' },
  vendor: { en: 'You received this because you run a shop on Dhoblio.', ur: 'آپ کو یہ ای میل اس لیے ملی کہ آپ ڈھوبلیو پر دکان چلاتے ہیں۔' },
  rider: { en: 'You received this because you are a Dhoblio rider.', ur: 'آپ کو یہ ای میل اس لیے ملی کہ آپ ڈھوبلیو کے رائیڈر ہیں۔' },
  login: {
    en: 'You received this because a sign-in code was requested for your account. If that was not you, you can ignore this email.',
    ur: 'آپ کو یہ ای میل اس لیے ملی کہ آپ کے اکاؤنٹ کے لیے سائن اِن کوڈ مانگا گیا تھا۔ اگر یہ آپ نے نہیں مانگا تو اس ای میل کو نظر انداز کر دیں۔',
  },
  general: { en: 'You received this message from Dhoblio.', ur: 'آپ کو یہ پیغام ڈھوبلیو کی طرف سے ملا ہے۔' },
};

const reasonFor = (k: keyof typeof REASONS, locale: EmailLocale) => REASONS[k][locale];

// ---- Sample data (used by the dev preview and the tests) ----

const SAMPLE_ORDER: OrderCardData = {
  orderNo: 'DHB-LHR-000123',
  shop: 'Al-Karam Dry Cleaners, Gulberg III',
  items: [
    { name: 'Shalwar Kameez', qty: 2, amount: 'Rs 520' },
    { name: 'Suit (2 piece)', qty: 1, amount: 'Rs 1,100' },
  ],
  subtotal: 'Rs 1,620',
  deliveryFee: 'Rs 150',
  discount: 'Rs 100',
  total: 'Rs 1,670',
  pickup: 'Sun, 8 Nov, 10:00 am - 11:00 am',
  delivery: 'Tue, 10 Nov, 6:00 pm - 7:00 pm',
  address: 'House 14, Street 7, Gulberg III, Lahore',
  payment: 'Cash on delivery',
};

const SAMPLE_BASE: EmailVars = {
  orderNo: 'DHB-LHR-000123',
  orderId: 'b7e2c1a4-3f5d-4e8a-9c21-5d6e7f8a9b01',
  vendor: 'Al-Karam Dry Cleaners',
  order: SAMPLE_ORDER,
};

// ---- Customer order lifecycle ----

interface OrderKind {
  tone: Tone;
  step: number;
  badge: [string, string];
  title: (v: EmailVars, t: ReturnType<typeof pick>, i: ReturnType<typeof isolate>) => string;
  subtitle: (v: EmailVars, t: ReturnType<typeof pick>, i: ReturnType<typeof isolate>) => string;
  subject: (v: EmailVars, t: ReturnType<typeof pick>, i: ReturnType<typeof isolate>) => string;
  extra?: (v: EmailVars, t: ReturnType<typeof pick>) => EmailModel['blocks'];
  cta?: (t: ReturnType<typeof pick>, ctx: RenderContext, locale: EmailLocale, v: EmailVars) => EmailModel['cta'];
  noTracker?: boolean;
}

const trackOrder = (t: ReturnType<typeof pick>, ctx: RenderContext, locale: EmailLocale, v: EmailVars): EmailModel['cta'] => ({
  label: t('Track your order', 'آرڈر ٹریک کریں'),
  url: link(ctx, locale, v.orderId ? `/orders/${v.orderId}` : '/orders'),
});

const ORDER_KINDS: Record<string, OrderKind> = {
  order_placed: {
    tone: 'brand',
    step: 0,
    badge: ['Order placed', 'آرڈر بھیج دیا گیا'],
    title: (v, t, i) => t(`Order sent to ${v.vendor}`, `آرڈر ${i(v.vendor)} کو بھیج دیا گیا`),
    subtitle: (_v, t) => t('We will let you know the moment they confirm.', 'ان کی تصدیق ہوتے ہی ہم آپ کو بتا دیں گے۔'),
    subject: (v, t, i) => t(`Order ${v.orderNo} sent to ${v.vendor}`, `آرڈر ${i(v.orderNo)} ${i(v.vendor)} کو بھیج دیا گیا`),
    extra: (_v, t) => [{ t: 'notice', tone: 'info', text: t('Nothing to do right now. You can follow every step of this order from your account.', 'ابھی آپ کو کچھ کرنے کی ضرورت نہیں۔ اس آرڈر کا ہر مرحلہ آپ اپنے اکاؤنٹ میں دیکھ سکتے ہیں۔') }],
    cta: trackOrder,
  },
  order_accepted: {
    tone: 'success',
    step: 1,
    badge: ['Accepted', 'قبول ہو گیا'],
    title: (v, t, i) => t(`${v.vendor} accepted your order`, `${i(v.vendor)} نے آپ کا آرڈر قبول کر لیا`),
    subtitle: (_v, t) => t('Your pickup is confirmed.', 'آپ کا پک اپ پکا ہو گیا ہے۔'),
    subject: (v, t, i) => t(`${v.vendor} accepted order ${v.orderNo}`, `${i(v.vendor)} نے آرڈر ${i(v.orderNo)} قبول کر لیا`),
    extra: (_v, t) => [
      {
        t: 'list',
        title: t('What happens next', 'آگے کیا ہوگا'),
        items: [
          t('A rider collects your clothes in your pickup slot.', 'رائیڈر آپ کے پک اپ کے وقت پر کپڑے لینے آئے گا۔'),
          t('The shop cleans and presses them.', 'دکان ان کی صفائی اور استری کرے گی۔'),
          t('We deliver them back to your door in your delivery slot.', 'ہم انہیں آپ کے ڈیلیوری کے وقت پر آپ کے دروازے تک پہنچائیں گے۔'),
        ],
      },
    ],
    cta: trackOrder,
  },
  order_rejected: {
    tone: 'danger',
    step: 0,
    noTracker: true,
    badge: ['Not accepted', 'قبول نہیں ہوا'],
    title: (v, t, i) => t(`${v.vendor} could not take your order`, `${i(v.vendor)} آپ کا آرڈر قبول نہیں کر سکا`),
    subtitle: (_v, t) => t('Sorry about that. You have not been charged.', 'معذرت۔ آپ سے کوئی رقم نہیں لی گئی۔'),
    subject: (v, t, i) => t(`Order ${v.orderNo} was not accepted`, `آرڈر ${i(v.orderNo)} قبول نہیں ہوا`),
    extra: (v, t) => [
      ...(v.reason ? ([{ t: 'notice', tone: 'danger', title: t('Reason', 'وجہ'), text: v.reason }] as EmailModel['blocks']) : []),
      { t: 'p', text: t('Other laundries near you can take this order, usually within minutes.', 'آپ کے قریب دوسری دکانیں یہ آرڈر لے سکتی ہیں، عموماً چند منٹ میں۔') },
    ],
    cta: (t, ctx, locale) => ({ label: t('Find another laundry', 'دوسری دکان تلاش کریں'), url: link(ctx, locale, '/discovery') }),
  },
  order_cancelled: {
    tone: 'warning',
    step: 0,
    noTracker: true,
    badge: ['Cancelled', 'منسوخ'],
    title: (v, t, i) => t(`Order ${v.orderNo} was cancelled`, `آرڈر ${i(v.orderNo)} منسوخ کر دیا گیا`),
    subtitle: (_v, t) => t('No payment is due for this order.', 'اس آرڈر کی کوئی ادائیگی باقی نہیں۔'),
    subject: (v, t, i) => t(`Order ${v.orderNo} cancelled`, `آرڈر ${i(v.orderNo)} منسوخ`),
    extra: (v, t) => (v.reason ? [{ t: 'notice', tone: 'warning', title: t('Reason', 'وجہ'), text: v.reason }] : []),
    cta: (t, ctx, locale) => ({ label: t('Order again', 'دوبارہ آرڈر کریں'), url: link(ctx, locale, '/discovery') }),
  },
  order_picked_up: {
    tone: 'info',
    step: 2,
    badge: ['Picked up', 'کپڑے وصول ہو گئے'],
    title: (_v, t) => t('Your clothes are picked up', 'آپ کے کپڑے وصول ہو گئے'),
    subtitle: (v, t, i) => t(`On their way to ${v.vendor}.`, `${i(v.vendor)} کی طرف جا رہے ہیں۔`),
    subject: (v, t, i) => t(`Clothes picked up - order ${v.orderNo}`, `کپڑے وصول ہو گئے - آرڈر ${i(v.orderNo)}`),
    cta: trackOrder,
  },
  order_in_process: {
    tone: 'info',
    step: 2,
    badge: ['In process', 'کام شروع ہو گیا'],
    title: (v, t, i) => t(`${v.vendor} started on your order`, `${i(v.vendor)} نے آپ کے آرڈر پر کام شروع کر دیا`),
    subtitle: (_v, t) => t('Careful cleaning and pressing, one piece at a time.', 'احتیاط سے صفائی اور استری، ایک ایک کپڑے کی۔'),
    subject: (v, t, i) => t(`Work started on order ${v.orderNo}`, `آرڈر ${i(v.orderNo)} پر کام شروع ہو گیا`),
    cta: trackOrder,
  },
  order_ready: {
    tone: 'success',
    step: 2,
    badge: ['Ready', 'تیار'],
    title: (_v, t) => t('Your order is ready', 'آپ کا آرڈر تیار ہے'),
    subtitle: (_v, t) => t('It will be delivered in your delivery slot.', 'یہ آپ کے ڈیلیوری کے وقت پر پہنچایا جائے گا۔'),
    subject: (v, t, i) => t(`Order ${v.orderNo} is ready`, `آرڈر ${i(v.orderNo)} تیار ہے`),
    cta: trackOrder,
  },
  order_out_for_delivery: {
    tone: 'info',
    step: 3,
    badge: ['On the way', 'روانہ'],
    title: (_v, t) => t('Your order is on its way', 'آپ کا آرڈر آپ کی طرف روانہ ہے'),
    subtitle: (v, t) => t(v.rider ? `${v.rider} is bringing it to you.` : 'Your rider is bringing it to you.', v.rider ? `${v.rider} اسے آپ تک لا رہے ہیں۔` : 'آپ کا رائیڈر اسے آپ تک لا رہا ہے۔'),
    subject: (v, t, i) => t(`Order ${v.orderNo} is on its way`, `آرڈر ${i(v.orderNo)} ڈیلیوری کے لیے روانہ`),
    extra: (_v, t) => [{ t: 'notice', tone: 'warning', title: t('Keep your delivery code ready', 'اپنا ڈیلیوری کوڈ تیار رکھیں'), text: t('Give the code to the rider only when you have your clothes in hand.', 'یہ کوڈ رائیڈر کو صرف اس وقت دیں جب کپڑے آپ کے ہاتھ میں ہوں۔') }],
    cta: trackOrder,
  },
  order_delivered: {
    tone: 'success',
    step: 5,
    badge: ['Delivered', 'ڈیلیور ہو گیا'],
    title: (_v, t) => t('Delivered. Thank you!', 'آرڈر ڈیلیور ہو گیا۔ شکریہ!'),
    subtitle: (_v, t) => t('We hope everything looks fresh.', 'امید ہے سب کچھ تازہ اور صاف ہے۔'),
    subject: (v, t, i) => t(`Order ${v.orderNo} delivered`, `آرڈر ${i(v.orderNo)} ڈیلیور ہو گیا`),
    extra: (_v, t) => [{ t: 'p', text: t('Something not right? Open the order and tell us within 48 hours, and we will look into it.', 'کچھ ٹھیک نہیں؟ آرڈر کھول کر 48 گھنٹے کے اندر ہمیں بتائیں، ہم اسے دیکھیں گے۔') }],
    cta: (t, ctx, locale, v) => ({ label: t('Rate your order', 'اپنے آرڈر کو ریٹ کریں'), url: link(ctx, locale, v.orderId ? `/orders/${v.orderId}` : '/orders') }),
  },
};

function orderCard(v: EmailVars): OrderCardData {
  return { ...(v.order ?? { orderNo: v.orderNo ?? '' }), orderNo: v.order?.orderNo ?? v.orderNo ?? '', shop: v.order?.shop ?? v.vendor };
}

function orderDef(name: string, kind: OrderKind): Def {
  return {
    label: `Order: ${kind.badge[0]}`,
    sample: { ...SAMPLE_BASE, ...(name === 'order_rejected' ? { reason: 'We are fully booked for that slot.' } : {}), ...(name === 'order_cancelled' ? { reason: 'Cancelled at your request.' } : {}), ...(name === 'order_out_for_delivery' ? { rider: 'Bilal Ahmed' } : {}) },
    build(v, locale, ctx) {
      const t = pick(locale);
      const i = isolate(locale);
      const blocks: EmailModel['blocks'] = [
        ...(kind.noTracker ? [] : ([{ t: 'tracker', step: kind.step }] as EmailModel['blocks'])),
        { t: 'order', order: orderCard(v) },
        ...(kind.extra?.(v, t) ?? []),
      ];
      return {
        subject: kind.subject(v, t, i),
        preheader: kind.subtitle(v, t, i),
        tone: kind.tone,
        badge: t(...kind.badge),
        title: kind.title(v, t, i),
        subtitle: kind.subtitle(v, t, i),
        blocks,
        cta: kind.cta?.(t, ctx, locale, v),
        reason: reasonFor('customer', locale),
        mirror: v.mirror,
      };
    },
  };
}

// ---- Vendor ----

const vendorShopLink = (ctx: RenderContext, locale: EmailLocale, path: string) => link(ctx, locale, `/shop${path}`);

const vendorNewOrder: Def = {
  label: 'Vendor: new order',
  sample: { ...SAMPLE_BASE, minutes: 15 },
  build(v, locale, ctx) {
    const t = pick(locale);
    const i = isolate(locale);
    const card = orderCard(v);
    return {
      subject: t(`New order ${v.orderNo}`, `نیا آرڈر ${i(v.orderNo)}`),
      preheader: t(`Please respond within ${v.minutes ?? 15} minutes.`, `براہ کرم ${i(v.minutes ?? 15)} منٹ میں جواب دیں۔`),
      tone: 'warning',
      badge: t('New order', 'نیا آرڈر'),
      title: t('You have a new order', 'آپ کے پاس نیا آرڈر ہے'),
      subtitle: t('Accept it before the timer runs out.', 'وقت ختم ہونے سے پہلے اسے قبول کریں۔'),
      blocks: [
        { t: 'order', order: card },
        { t: 'notice', tone: 'warning', title: t('Respond quickly', 'جلد جواب دیں'), text: t(`Orders that are not answered within ${v.minutes ?? 15} minutes are rejected automatically.`, `جن آرڈرز کا ${i(v.minutes ?? 15)} منٹ میں جواب نہ آئے وہ خود بخود مسترد ہو جاتے ہیں۔`) },
      ],
      cta: { label: t('Open the orders board', 'آرڈرز بورڈ کھولیں'), url: vendorShopLink(ctx, locale, '/orders') },
      reason: reasonFor('vendor', locale),
      mirror: v.mirror,
    };
  },
};

const vendorOrderCancelled: Def = {
  label: 'Vendor: order cancelled',
  sample: { ...SAMPLE_BASE, reason: 'Cancelled by the customer.' },
  build(v, locale, ctx) {
    const t = pick(locale);
    const i = isolate(locale);
    return {
      subject: t(`Order ${v.orderNo} was cancelled`, `آرڈر ${i(v.orderNo)} منسوخ کر دیا گیا`),
      preheader: t('No action is needed.', 'کوئی کارروائی ضروری نہیں۔'),
      tone: 'danger',
      badge: t('Cancelled', 'منسوخ'),
      title: t(`Order ${v.orderNo} was cancelled`, `آرڈر ${i(v.orderNo)} منسوخ کر دیا گیا`),
      subtitle: t('You can stop work on it.', 'آپ اس پر کام روک سکتے ہیں۔'),
      blocks: [
        { t: 'order', order: { ...orderCard(v), items: undefined, itemCount: undefined } },
        ...(v.reason ? ([{ t: 'notice', tone: 'danger', title: t('Reason', 'وجہ'), text: v.reason }] as EmailModel['blocks']) : []),
      ],
      cta: { label: t('Open the orders board', 'آرڈرز بورڈ کھولیں'), url: vendorShopLink(ctx, locale, '/orders') },
      reason: reasonFor('vendor', locale),
      mirror: v.mirror,
    };
  },
};

const vendorOrderExpired: Def = {
  label: 'Vendor: order expired',
  sample: SAMPLE_BASE,
  build(v, locale, ctx) {
    const t = pick(locale);
    const i = isolate(locale);
    return {
      subject: t(`Order ${v.orderNo} expired`, `آرڈر ${i(v.orderNo)} کی مدت ختم ہو گئی`),
      preheader: t('It was not answered in time.', 'بروقت جواب نہیں ملا۔'),
      tone: 'warning',
      badge: t('Expired', 'مدت ختم'),
      title: t('You missed an order', 'ایک آرڈر آپ سے رہ گیا'),
      subtitle: t(`Order ${v.orderNo} was rejected automatically because it was not answered in time.`, `آرڈر ${i(v.orderNo)} بروقت جواب نہ ملنے کی وجہ سے خود بخود مسترد ہو گیا۔`),
      blocks: [
        { t: 'p', text: t('Fast answers keep your shop higher in search results. Turn on the alert sound on your orders board so you never miss one.', 'جلد جواب دینے سے آپ کی دکان سرچ میں اوپر رہتی ہے۔ کوئی آرڈر نہ چھوٹے اس کے لیے آرڈرز بورڈ پر الرٹ کی آواز آن رکھیں۔') },
      ],
      cta: { label: t('Open the orders board', 'آرڈرز بورڈ کھولیں'), url: vendorShopLink(ctx, locale, '/orders') },
      reason: reasonFor('vendor', locale),
      mirror: v.mirror,
    };
  },
};

function decisionDef(kind: 'vendor' | 'rider'): Def {
  return {
    label: kind === 'vendor' ? 'Vendor: application decision' : 'Rider: application decision',
    sample: { name: kind === 'vendor' ? 'Al-Karam Dry Cleaners' : 'Bilal Ahmed', decision: 'APPROVED', reason: 'The shop photo was too dark. Please upload a clearer one.' },
    build(v, locale, ctx) {
      const t = pick(locale);
      const i = isolate(locale);
      const who = v.name ?? '';
      const d = v.decision ?? 'APPROVED';
      const panel = kind === 'vendor' ? vendorShopLink(ctx, locale, '/orders') : link(ctx, locale, '/rider/home');
      const register = kind === 'vendor' ? vendorShopLink(ctx, locale, '/register') : link(ctx, locale, '/rider/register');
      const why: EmailModel['blocks'] = v.reason ? [{ t: 'notice', tone: 'danger', title: t('Reason', 'وجہ'), text: v.reason }] : [];
      const base = { reason: reasonFor(kind, locale), mirror: v.mirror };
      const noun = kind === 'vendor' ? t('shop', 'دکان') : t('rider account', 'رائیڈر اکاؤنٹ');
      if (d === 'APPROVED') {
        return {
          ...base,
          subject: kind === 'vendor' ? t('Your Dhoblio shop is approved', 'آپ کی دکان ڈھوبلیو پر منظور ہو گئی') : t('Your Dhoblio rider account is approved', 'آپ کا رائیڈر اکاؤنٹ منظور ہو گیا'),
          preheader: t('Welcome aboard. You can start now.', 'خوش آمدید۔ آپ ابھی شروع کر سکتے ہیں۔'),
          tone: 'success',
          badge: t('Approved', 'منظور'),
          title: kind === 'vendor' ? t(`${who} is approved`, `${i(who)} منظور ہو گئی`) : t('You are approved', 'آپ کا اکاؤنٹ منظور ہو گیا'),
          subtitle: t('Welcome to Dhoblio.', 'ڈھوبلیو میں خوش آمدید۔'),
          blocks: [
            {
              t: 'list',
              title: t('Get started', 'شروع کریں'),
              items:
                kind === 'vendor'
                  ? [t('Add your services and prices to the catalog.', 'کیٹلاگ میں اپنی سروسز اور قیمتیں شامل کریں۔'), t('Set your opening hours.', 'اپنے کھلنے کے اوقات مقرر کریں۔'), t('Switch your availability to Open to receive orders.', 'آرڈرز لینے کے لیے دستیابی کو کھلا کریں۔')]
                  : [t('Sign in and go online.', 'سائن اِن کریں اور آن لائن ہوں۔'), t('Accept a pickup or delivery job near you.', 'اپنے قریب پک اپ یا ڈیلیوری کا کام قبول کریں۔'), t('Complete it with the customer code or a photo.', 'کسٹمر کے کوڈ یا تصویر سے اسے مکمل کریں۔')],
            },
          ],
          cta: { label: kind === 'vendor' ? t('Open your shop panel', 'اپنا شاپ پینل کھولیں') : t('Open the rider app', 'رائیڈر ایپ کھولیں'), url: panel },
        };
      }
      if (d === 'REJECTED') {
        return {
          ...base,
          subject: kind === 'vendor' ? t('Your Dhoblio shop application needs changes', 'آپ کی دکان کی درخواست میں تبدیلی درکار ہے') : t('Your Dhoblio rider application needs changes', 'آپ کی رائیڈر درخواست میں تبدیلی درکار ہے'),
          preheader: t('A few details need fixing before we can approve you.', 'منظوری سے پہلے کچھ تفصیلات درست کرنی ہیں۔'),
          tone: 'danger',
          badge: t('Needs changes', 'تبدیلی درکار'),
          title: kind === 'vendor' ? t(`We could not approve ${who} yet`, `ہم ابھی ${i(who)} کو منظور نہیں کر سکے`) : t('We could not approve your application yet', 'ہم ابھی آپ کی درخواست منظور نہیں کر سکے'),
          subtitle: t('Fix the details and send it again.', 'تفصیلات درست کر کے دوبارہ بھیجیں۔'),
          blocks: [...why, { t: 'p', text: t('Resubmitting takes a few minutes, and we review it as soon as it arrives.', 'دوبارہ بھیجنے میں چند منٹ لگتے ہیں اور ہم آتے ہی اس کا جائزہ لیتے ہیں۔') }],
          cta: { label: t('Fix and resubmit', 'درست کر کے دوبارہ بھیجیں'), url: register },
        };
      }
      if (d === 'SUSPENDED') {
        return {
          ...base,
          subject: t(`Your Dhoblio ${kind === 'vendor' ? 'shop' : 'rider account'} is suspended`, kind === 'vendor' ? 'آپ کی دکان معطل کر دی گئی ہے' : 'آپ کا رائیڈر اکاؤنٹ معطل کر دیا گیا ہے'),
          preheader: t('Contact support to resolve this.', 'اس مسئلے کے حل کے لیے سپورٹ سے رابطہ کریں۔'),
          tone: 'danger',
          badge: t('Suspended', 'معطل'),
          title: kind === 'vendor' ? t(`${who} is suspended`, `${i(who)} معطل ہے`) : t('Your account is suspended', 'آپ کا اکاؤنٹ معطل ہے'),
          subtitle: kind === 'vendor' ? t('Your shop will not receive new orders for now.', 'فی الحال آپ کی دکان کو نئے آرڈرز نہیں ملیں گے۔') : t('You cannot take jobs for now.', 'فی الحال آپ کام نہیں لے سکتے۔'),
          blocks: [...why, { t: 'p', text: t('Write to support@dhoblio.pk and we will help you sort it out.', '\u2066support@dhoblio.pk\u2069 پر لکھیں، ہم مسئلہ حل کرنے میں آپ کی مدد کریں گے۔') }],
        };
      }
      return {
        ...base,
        subject: t(`Your Dhoblio ${noun} is active again`, kind === 'vendor' ? 'آپ کی دکان دوبارہ فعال ہو گئی' : 'آپ کا رائیڈر اکاؤنٹ دوبارہ فعال ہو گیا'),
        preheader: t('You can take orders again.', 'آپ دوبارہ کام لے سکتے ہیں۔'),
        tone: 'success',
        badge: t('Active again', 'دوبارہ فعال'),
        title: t('You are back', 'آپ دوبارہ شامل ہیں'),
        subtitle: kind === 'vendor' ? t('Set your availability to Open to receive orders.', 'آرڈرز لینے کے لیے دستیابی کو کھلا کریں۔') : t('Go online to take jobs.', 'کام لینے کے لیے آن لائن ہوں۔'),
        blocks: [],
        cta: { label: kind === 'vendor' ? t('Open your shop panel', 'اپنا شاپ پینل کھولیں') : t('Open the rider app', 'رائیڈر ایپ کھولیں'), url: panel },
      };
    },
  };
}

const vendorPayout: Def = {
  label: 'Vendor: payout',
  sample: { vendor: 'Al-Karam Dry Cleaners', payout: { kind: 'PAID', amount: 'Rs 12,450', method: 'Bank transfer', accountRef: 'PK36 SCBL 0000 0011 2345 6702', txnRef: 'TXN-20261106-0457' } },
  build(v, locale, ctx) {
    const t = pick(locale);
    const i = isolate(locale);
    const p = v.payout ?? { kind: 'REQUESTED' as PayoutKind, amount: '' };
    const stat = { t: 'stat' as const, label: t('Amount', 'رقم'), value: p.amount };
    const rows: { label: string; value: string; mono?: boolean }[] = [
      ...(p.method ? [{ label: t('Method', 'طریقہ'), value: p.method }] : []),
      ...(p.accountRef ? [{ label: t('To account', 'اکاؤنٹ'), value: p.accountRef, mono: true }] : []),
      ...(p.txnRef ? [{ label: t('Reference', 'حوالہ'), value: p.txnRef, mono: true }] : []),
    ];
    const cta = { label: t('View payouts', 'ادائیگیاں دیکھیں'), url: vendorShopLink(ctx, locale, '/payouts') };
    const common = { reason: reasonFor('vendor', locale), mirror: v.mirror, cta };
    if (p.kind === 'PAID') {
      return { ...common, subject: t(`Payout of ${p.amount} sent`, `${i(p.amount)} کی ادائیگی بھیج دی گئی`), preheader: t('Your money is on its way to your account.', 'آپ کی رقم آپ کے اکاؤنٹ کی طرف روانہ ہے۔'), tone: 'success', badge: t('Paid', 'ادا شدہ'), title: t('Your payout was sent', 'آپ کی ادائیگی بھیج دی گئی'), subtitle: t('It can take a short while to show in your bank.', 'آپ کے بینک میں نظر آنے میں کچھ وقت لگ سکتا ہے۔'), blocks: [stat, { t: 'kv', rows }] };
    }
    if (p.kind === 'APPROVED') {
      return { ...common, subject: t(`Payout of ${p.amount} approved`, `${i(p.amount)} کی ادائیگی منظور ہو گئی`), preheader: t('It will be sent shortly.', 'یہ جلد بھیج دی جائے گی۔'), tone: 'info', badge: t('Approved', 'منظور'), title: t('Your payout is approved', 'آپ کی ادائیگی منظور ہو گئی'), subtitle: t('Our finance team will send it shortly.', 'ہماری فنانس ٹیم اسے جلد بھیج دے گی۔'), blocks: [stat, { t: 'kv', rows }] };
    }
    if (p.kind === 'REJECTED') {
      return { ...common, subject: t(`Payout of ${p.amount} was not approved`, `${i(p.amount)} کی ادائیگی منظور نہیں ہوئی`), preheader: t('The money is back in your balance.', 'رقم آپ کے بیلنس میں واپس آ گئی ہے۔'), tone: 'danger', badge: t('Not approved', 'منظور نہیں'), title: t('Your payout was not approved', 'آپ کی ادائیگی منظور نہیں ہوئی'), subtitle: t('The amount is back in your available balance.', 'رقم آپ کے دستیاب بیلنس میں واپس آ گئی ہے۔'), blocks: [stat, { t: 'kv', rows }, ...(p.note ? ([{ t: 'notice', tone: 'danger', title: t('Reason', 'وجہ'), text: p.note }] as EmailModel['blocks']) : [])] };
    }
    return { ...common, subject: t(`Payout of ${p.amount} requested`, `${i(p.amount)} کی ادائیگی کی درخواست موصول ہوئی`), preheader: t('Our finance team will review it.', 'ہماری فنانس ٹیم اس کا جائزہ لے گی۔'), tone: 'brand', badge: t('Requested', 'درخواست'), title: t('We received your payout request', 'ہمیں آپ کی ادائیگی کی درخواست مل گئی'), subtitle: t('Our finance team will review it.', 'ہماری فنانس ٹیم اس کا جائزہ لے گی۔'), blocks: [stat, { t: 'kv', rows }, { t: 'notice', tone: 'info', text: t('You will get another email when it is approved and when it is sent.', 'منظوری اور ادائیگی بھیجے جانے پر آپ کو ایک اور ای میل ملے گی۔') }] };
  },
};

// ---- Rider ----

function riderJob(kind: 'offer' | 'assigned' | 'cancelled'): Def {
  return {
    label: `Rider: job ${kind}`,
    sample: { orderNo: 'DHB-LHR-000123', jobType: 'pickup', minutes: 5, reason: 'The customer cancelled the order.' },
    build(v, locale, ctx) {
      const t = pick(locale);
      const i = isolate(locale);
      const job = v.jobType === 'delivery' ? t('delivery', 'ڈیلیوری') : t('pickup', 'پک اپ');
      const rows = [
        { label: t('Order', 'آرڈر'), value: v.orderNo ?? '', mono: true },
        { label: t('Job', 'کام'), value: job },
      ];
      const cta = { label: t('Open the rider app', 'رائیڈر ایپ کھولیں'), url: link(ctx, locale, '/rider/home') };
      const common = { reason: reasonFor('rider', locale), mirror: v.mirror };
      if (kind === 'offer') {
        return { ...common, subject: t(`New ${job} job - order ${v.orderNo}`, `نیا ${job} کام - آرڈر ${i(v.orderNo)}`), preheader: t(`Accept within ${v.minutes ?? 5} minutes.`, `${i(v.minutes ?? 5)} منٹ میں قبول کریں۔`), tone: 'warning', badge: t('New job', 'نیا کام'), title: t(`New ${job} job near you`, `آپ کے قریب نیا ${job} کام`), subtitle: t('First to accept gets it.', 'جو پہلے قبول کرے گا اسے ملے گا۔'), blocks: [{ t: 'kv', rows }, { t: 'notice', tone: 'warning', text: t(`Open the app and accept within ${v.minutes ?? 5} minutes, or the job goes to another rider.`, `ایپ کھولیں اور ${i(v.minutes ?? 5)} منٹ میں قبول کریں، ورنہ یہ کام کسی اور رائیڈر کو چلا جائے گا۔`) }], cta };
      }
      if (kind === 'assigned') {
        return { ...common, subject: t(`Job assigned - order ${v.orderNo}`, `کام سونپا گیا - آرڈر ${i(v.orderNo)}`), preheader: t('Open the app for the address and steps.', 'پتہ اور مراحل کے لیے ایپ کھولیں۔'), tone: 'brand', badge: t('Assigned', 'سونپا گیا'), title: t('A job was assigned to you', 'آپ کو ایک کام سونپا گیا ہے'), subtitle: t('Open the app for the address and steps.', 'پتہ اور مراحل کے لیے ایپ کھولیں۔'), blocks: [{ t: 'kv', rows }], cta };
      }
      return { ...common, subject: t(`Job cancelled - order ${v.orderNo}`, `کام منسوخ - آرڈر ${i(v.orderNo)}`), preheader: t('It is no longer yours.', 'یہ اب آپ کے ذمے نہیں۔'), tone: 'danger', badge: t('Cancelled', 'منسوخ'), title: t('This job is no longer yours', 'یہ کام اب آپ کے ذمے نہیں'), subtitle: t('You do not need to do anything for it.', 'آپ کو اس کے لیے کچھ کرنے کی ضرورت نہیں۔'), blocks: [{ t: 'kv', rows }, ...(v.reason ? ([{ t: 'notice', tone: 'danger', title: t('Reason', 'وجہ'), text: v.reason }] as EmailModel['blocks']) : [])], cta };
    },
  };
}

const orderRiderAssigned: Def = {
  label: 'Order: rider assigned',
  sample: { ...SAMPLE_BASE, rider: 'Bilal Ahmed', jobType: 'pickup' },
  build(v, locale, ctx) {
    const t = pick(locale);
    const i = isolate(locale);
    const job = v.jobType === 'delivery' ? t('delivery', 'ڈیلیوری') : t('pickup', 'پک اپ');
    return {
      subject: t(`Your rider for order ${v.orderNo}`, `آرڈر ${i(v.orderNo)} کے لیے آپ کا رائیڈر`),
      preheader: t(`${v.rider} will handle the ${job}.`, `${i(v.rider)} ${job} کریں گے۔`),
      tone: 'info',
      badge: t('Rider assigned', 'رائیڈر مقرر'),
      title: t(`${v.rider} is your rider`, `${i(v.rider)} آپ کے رائیڈر ہیں`),
      subtitle: t(`They will handle the ${job} for your order.`, `آپ کے آرڈر کی ${job} وہ کریں گے۔`),
      blocks: [{ t: 'order', order: { ...orderCard(v), items: undefined, itemCount: undefined, subtotal: undefined, deliveryFee: undefined, discount: undefined, total: undefined, address: undefined, payment: undefined } }],
      cta: trackOrder(t, ctx, locale, v),
      reason: reasonFor('customer', locale),
      mirror: v.mirror,
    };
  },
};

// ---- Sign-in code, announcements, test-inbox copies ----

const loginCode: Def = {
  label: 'Sign-in code',
  sample: { role: 'CUSTOMER', code: '482913', minutes: 5 },
  build(v, locale) {
    const t = pick(locale);
    const i = isolate(locale);
    const role = ROLE_LABEL[v.role ?? 'CUSTOMER'][locale];
    const minutes = v.minutes ?? 5;
    const code = v.code ?? '';
    return {
      subject: t(`Your Dhoblio sign-in code is ${code}`, `آپ کا ڈھوبلیو سائن اِن کوڈ ${i(code)} ہے`),
      preheader: t(`Use ${code} to sign in as ${role}. It expires in ${minutes} minutes.`, `${role} کے طور پر سائن اِن کرنے کے لیے ${i(code)} استعمال کریں۔ یہ ${i(minutes)} منٹ میں ختم ہو جائے گا۔`),
      tone: 'brand',
      badge: role,
      title: t('Your sign-in code', 'آپ کا سائن اِن کوڈ'),
      subtitle: t(`Enter this code to sign in to your ${role} account.`, `اپنے ${role} اکاؤنٹ میں سائن اِن کرنے کے لیے یہ کوڈ درج کریں۔`),
      blocks: [
        { t: 'code', code, caption: t(`Expires in ${minutes} minutes`, `یہ کوڈ ${i(minutes)} منٹ میں ختم ہو جائے گا`) },
        ...(v.to || v.account
          ? ([{ t: 'kv', rows: [...(v.account ? [{ label: t('Account', 'اکاؤنٹ'), value: v.account }] : []), ...(v.to ? [{ label: t('Phone', 'فون'), value: v.to, mono: true }] : [])] }] as EmailModel['blocks'])
          : []),
        { t: 'notice', tone: 'warning', title: t('Keep it to yourself', 'اسے اپنے تک رکھیں'), text: t('Dhoblio will never ask you for this code by phone, chat or email. Do not share it with anyone, including our team.', 'ڈھوبلیو آپ سے یہ کوڈ فون، چیٹ یا ای میل پر کبھی نہیں مانگے گا۔ اسے کسی کے ساتھ شیئر نہ کریں، ہماری ٹیم کے ساتھ بھی نہیں۔') },
      ],
      reason: reasonFor('login', locale),
      mirror: v.mirror,
    };
  },
};

const announcement: Def = {
  label: 'Announcement',
  sample: { title: 'Eid delivery timings', body: 'Pickups and deliveries run from 9 am to 6 pm during Eid days.\n\nBook early to get the slot you want.', ctaLabel: 'Book a pickup', ctaUrl: 'https://dhoblio.pk' },
  build(v, locale) {
    const t = pick(locale);
    return {
      subject: v.title ?? t('News from Dhoblio', 'ڈھوبلیو کی طرف سے خبر'),
      preheader: (v.body ?? '').split('\n')[0] ?? '',
      tone: 'brand',
      badge: t('News', 'خبر'),
      title: v.title ?? '',
      blocks: (v.body ?? '').split(/\n{2,}/).filter(Boolean).map((text) => ({ t: 'p' as const, text })),
      cta: v.ctaUrl ? { label: v.ctaLabel ?? t('Open Dhoblio', 'ڈھوبلیو کھولیں'), url: v.ctaUrl } : undefined,
      reason: reasonFor('general', locale),
      mirror: v.mirror,
    };
  },
};

const messageCopy: Def = {
  label: 'Test-inbox copy of a message',
  sample: { channel: 'SMS', to: '+923001234567', account: 'Rider - Bilal Ahmed', content: 'Order DHB-LHR-000123 was accepted.', sentAt: '2026-11-06 16:48 PKT', mirror: true },
  build(v, locale) {
    const t = pick(locale);
    const rows = [
      { label: t('Channel', 'چینل'), value: v.channel ?? '' },
      { label: t('To', 'وصول کنندہ'), value: v.to ?? '', mono: true },
      ...(v.account ? [{ label: t('Account', 'اکاؤنٹ'), value: v.account }] : []),
      ...(v.details ?? []),
      ...(v.sentAt ? [{ label: t('Sent at', 'وقت'), value: v.sentAt }] : []),
    ];
    return {
      subject: `[Dhoblio dev] ${v.channel ?? 'Message'} to ${v.to ?? ''}`,
      preheader: (v.content ?? '').slice(0, 120),
      tone: 'info',
      badge: v.channel ?? 'Copy',
      title: t(`${v.channel ?? 'Message'} message`, `${v.channel ?? 'پیغام'} پیغام`),
      subtitle: t('A copy of what the worker just sent.', 'ورکر نے ابھی جو بھیجا اس کی کاپی۔'),
      blocks: [{ t: 'kv', rows }, { t: 'notice', tone: 'brand', title: t('Message', 'پیغام'), text: v.content ?? '' }],
      reason: t('Test copies are only sent in development and staging.', 'ٹیسٹ کاپیاں صرف ڈیولپمنٹ اور اسٹیجنگ میں بھیجی جاتی ہیں۔'),
      mirror: true,
    };
  },
};

export const EMAIL_TEMPLATES: Record<EmailTemplateName, Def> = {
  login_code: loginCode,
  order_placed: orderDef('order_placed', ORDER_KINDS.order_placed),
  order_accepted: orderDef('order_accepted', ORDER_KINDS.order_accepted),
  order_rejected: orderDef('order_rejected', ORDER_KINDS.order_rejected),
  order_cancelled: orderDef('order_cancelled', ORDER_KINDS.order_cancelled),
  order_picked_up: orderDef('order_picked_up', ORDER_KINDS.order_picked_up),
  order_in_process: orderDef('order_in_process', ORDER_KINDS.order_in_process),
  order_ready: orderDef('order_ready', ORDER_KINDS.order_ready),
  order_out_for_delivery: orderDef('order_out_for_delivery', ORDER_KINDS.order_out_for_delivery),
  order_delivered: orderDef('order_delivered', ORDER_KINDS.order_delivered),
  order_rider_assigned: orderRiderAssigned,
  vendor_new_order: vendorNewOrder,
  vendor_order_cancelled: vendorOrderCancelled,
  vendor_order_expired: vendorOrderExpired,
  vendor_decision: decisionDef('vendor'),
  vendor_payout: vendorPayout,
  rider_decision: decisionDef('rider'),
  rider_job_offer: riderJob('offer'),
  rider_job_assigned: riderJob('assigned'),
  rider_job_cancelled: riderJob('cancelled'),
  announcement,
  message_copy: messageCopy,
};
