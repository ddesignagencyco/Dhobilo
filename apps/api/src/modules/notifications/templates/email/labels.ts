import type { EmailLocale } from './model';

/** Fixed UI words used by every email. Urdu follows docs/Dhoblio-URDU-GLOSSARY.md. */
export const UI: Record<EmailLocale, {
  brand: string;
  order: string;
  items: string;
  subtotal: string;
  deliveryFee: string;
  discount: string;
  total: string;
  pickup: string;
  delivery: string;
  address: string;
  payment: string;
  note: string;
  itemCount: (n: number) => string;
  tracker: string[];
  tagline: string;
  serving: string;
  help: string;
  mirrorBanner: string;
  mirrorText: string;
  copyLink: string;
  free: string;
}> = {
  en: {
    brand: 'Dhoblio',
    order: 'Order',
    items: 'Items',
    subtotal: 'Subtotal',
    deliveryFee: 'Delivery fee',
    discount: 'Discount',
    total: 'Total',
    pickup: 'Pickup',
    delivery: 'Delivery',
    address: 'Address',
    payment: 'Payment',
    note: 'Note',
    itemCount: (n) => `${n} item${n === 1 ? '' : 's'}`,
    tracker: ['Placed', 'Accepted', 'Cleaning', 'On the way', 'Delivered'],
    tagline: 'Laundry and dry cleaning, picked up and delivered.',
    serving: 'Serving Lahore',
    help: 'Need help? Write to support@dhoblio.pk',
    mirrorBanner: 'Test copy',
    mirrorText: 'This is a copy sent to the development test inbox. The real recipient received the original message.',
    copyLink: 'Button not working? Copy this link into your browser:',
    free: 'Free',
  },
  ur: {
    brand: 'ڈھوبلیو',
    order: 'آرڈر',
    items: 'آئٹمز',
    subtotal: 'ذیلی کل',
    deliveryFee: 'ڈیلیوری فیس',
    discount: 'رعایت',
    total: 'کل',
    pickup: 'پک اپ',
    delivery: 'ڈیلیوری',
    address: 'پتہ',
    payment: 'ادائیگی',
    note: 'نوٹ',
    itemCount: (n) => `${n} آئٹم`,
    tracker: ['بھیجا گیا', 'قبول', 'کام جاری', 'روانہ', 'ڈیلیور'],
    tagline: 'لانڈری اور ڈرائی کلیننگ، پک اپ اور ڈیلیوری کے ساتھ۔',
    serving: 'لاہور میں خدمات',
    help: 'مدد چاہیے؟ \u2066support@dhoblio.pk\u2069 پر لکھیں۔',
    mirrorBanner: 'ٹیسٹ کاپی',
    mirrorText: 'یہ ڈیولپمنٹ ٹیسٹ ان باکس کو بھیجی گئی کاپی ہے۔ اصل وصول کنندہ کو اصل پیغام مل چکا ہے۔',
    copyLink: 'بٹن کام نہیں کر رہا؟ یہ لنک اپنے براؤزر میں کاپی کریں:',
    free: 'مفت',
  },
};
