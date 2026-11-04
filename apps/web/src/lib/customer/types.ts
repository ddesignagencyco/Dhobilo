/** Shapes returned by the public/customer API routes used by the customer app. */

export interface ActiveCity {
  id: number;
  name: string;
  nameUr: string;
  timezone: string;
}

export interface CustomerProfile {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  role: string;
  locale: 'EN' | 'UR';
  referralCode: string | null;
}
