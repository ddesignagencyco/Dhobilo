import { ID, PHONE, SAMPLE_USER, TOKEN } from '../samples';
import type { OperationDocs } from '../types';
import { empty, ok } from './helpers';

export const authDocs: OperationDocs = {
  'POST /auth/otp/request': {
    summary: 'Send a login code by SMS',
    who: 'public',
    description:
      'Step 1 of signing in (customers, vendors, riders). Any Pakistani mobile number works in any common format ' +
      '(`03001234567`, `+92 300 1234567`, `923001234567`).\n\n' +
      '**Limits:** 3 codes per phone per 10 minutes and 10 per IP per hour. The code is valid for 5 minutes and works once.\n\n' +
      '> **In development** the app runs with `OTP_BYPASS=true`: no SMS is sent and the code is always **`123456`**.',
    requests: { default: { summary: 'Any Pakistani mobile number', value: { phone: PHONE.local } } },
    response: { description: 'Code sent', example: ok({ expiresInSeconds: 300 }) },
    errors: [
      { status: 400, code: 'INVALID_PHONE', when: 'Enter a valid Pakistani mobile number.' },
      { status: 429, code: 'RATE_LIMITED', when: 'Too many attempts. Please try again later.' },
    ],
  },
  'POST /auth/otp/verify': {
    summary: 'Sign in with the code',
    who: 'public',
    description:
      'Step 2. Exchanges the SMS code for an **access token** (valid 15 minutes) and sets a long-lived **refresh cookie** ' +
      '(`dhoblio_rt`, httpOnly). The first time a phone signs in, the account is created.\n\n' +
      '- `role` only matters on the very first login (`CUSTOMER` by default). An existing account keeps its role.\n' +
      '- Send header `X-Token-Transport: body` if your client cannot use cookies; the refresh token is then also returned in the body.\n' +
      '- **In this Swagger page the access token is applied to the Authorize button automatically** after a successful sign-in, ' +
      'so you can go straight to the protected endpoints.\n' +
      '- Admins do not use this endpoint: see **Admin sign-in**.',
    requests: {
      customer: { summary: 'Customer (default)', value: { phone: PHONE.local, code: '123456' } },
      vendor: { summary: 'First login as a vendor owner', value: { phone: '03000000099', code: '123456', role: 'VENDOR_OWNER' } },
      rider: { summary: 'First login as a rider', value: { phone: '03000000098', code: '123456', role: 'RIDER' } },
    },
    response: {
      description: 'Signed in',
      example: ok({ accessToken: TOKEN, expiresIn: 900, user: { id: ID.user, phone: PHONE.e164, name: null, email: null, role: 'CUSTOMER', adminRole: null, locale: 'EN', referralCode: 'Q35M9QBH' }, isNewUser: true }),
    },
    errors: [
      { status: 400, code: 'INVALID_OTP', when: 'The code is invalid or has expired.' },
      { status: 403, code: 'ACCOUNT_SUSPENDED', when: 'This account is not active.' },
      { status: 429, code: 'OTP_TOO_MANY_ATTEMPTS', when: 'Too many wrong codes. Request a new code.' },
    ],
  },
  'POST /auth/refresh': {
    summary: 'Get a new access token',
    who: 'public',
    description:
      'Call when the access token is about to expire. The refresh token comes from the `dhoblio_rt` cookie (browsers) or the body (other clients). ' +
      'Every refresh **rotates** the refresh token. If an already-used refresh token is ever replayed, the whole login is revoked as a precaution ' +
      'and the user must sign in again.',
    requests: { default: { summary: 'Cookie-less clients send the refresh token', value: { refreshToken: 'k3p9...refresh-token...Zq' } }, cookie: { summary: 'Browsers: empty body, cookie does the work', value: {} } },
    response: { description: 'New tokens', example: ok({ accessToken: TOKEN, expiresIn: 900, user: { id: ID.user, phone: PHONE.e164, name: 'Ayesha Khan', email: null, role: 'CUSTOMER', adminRole: null, locale: 'EN', referralCode: 'Q35M9QBH' }, isNewUser: false }) },
    errors: [{ status: 401, code: 'UNAUTHENTICATED', when: 'Please sign in again.' }],
  },
  'POST /auth/logout': {
    summary: 'Sign out',
    who: 'public',
    description: 'Revokes this login everywhere (all its refresh tokens and its access token, immediately). Always succeeds, even with an unknown token.',
    requests: { default: { summary: 'Cookie-less clients send the refresh token', value: { refreshToken: 'k3p9...refresh-token...Zq' } } },
    response: { description: 'Signed out', example: empty },
  },
  'POST /auth/admin/login': {
    summary: 'Admin sign-in (email + password)',
    who: 'public',
    description:
      'For platform staff only. 5 wrong passwords lock the account for 15 minutes. The error is the same for an unknown email and a wrong password.\n\n' +
      '> Development admin: `admin@dhoblio.local` / `ChangeMe!12345`.',
    requests: { default: { summary: 'Development admin', value: { email: 'admin@dhoblio.local', password: 'ChangeMe!12345' } } },
    response: { description: 'Signed in', example: ok({ accessToken: TOKEN, expiresIn: 900, user: { id: ID.user, phone: '+920000000000', name: 'Platform Admin', email: 'admin@dhoblio.local', role: 'ADMIN', adminRole: 'SUPER_ADMIN', locale: 'EN', referralCode: null }, isNewUser: false }) },
    errors: [
      { status: 401, code: 'INVALID_CREDENTIALS', when: 'Incorrect email or password.' },
      { status: 429, code: 'ACCOUNT_LOCKED', when: 'Too many failed sign-ins. Try again later.' },
    ],
  },
};

export const accountDocs: OperationDocs = {
  'GET /me': {
    summary: 'My profile',
    who: 'signed-in',
    response: { example: ok(SAMPLE_USER) },
  },
  'PATCH /me': {
    summary: 'Update my name or language',
    who: 'signed-in',
    description: 'Only `name` and `locale` can be changed here. Role, phone and email are never editable through this endpoint. `locale` also decides the language of notifications.',
    requests: { default: { summary: 'Switch to Urdu', value: { name: 'Ayesha Khan', locale: 'UR' } } },
    response: { example: ok({ ...SAMPLE_USER, locale: 'UR' }) },
  },
  'GET /me/notification-preferences': {
    summary: 'Which channels I get order updates on',
    who: 'signed-in',
    description: 'A channel that has never been changed is **on**. If WhatsApp is off, SMS is used instead (when allowed). Vendors can also be emailed; customers never are.',
    response: { example: ok({ push: true, whatsapp: true, sms: true, email: true }) },
  },
  'PATCH /me/notification-preferences': {
    summary: 'Switch notification channels on or off',
    who: 'signed-in',
    description: 'Send only the channels you want to change; the others keep their value.',
    requests: { default: { summary: 'No WhatsApp, SMS instead', value: { whatsapp: false } } },
    response: { example: ok({ push: true, whatsapp: false, sms: true, email: true }) },
  },
  'POST /me/devices': {
    summary: 'Register this device for push notifications',
    who: 'signed-in',
    description: 'Send the FCM / web-push registration token. A token belongs to one account at a time: registering it again on another account moves it.',
    requests: { default: { summary: 'Android device', value: { token: 'fcm-registration-token-from-firebase-sdk-0123456789', platform: 'android' } } },
    response: { status: 204, description: 'Registered (no body)' },
  },
  'DELETE /me/devices': {
    summary: 'Stop push notifications on this device',
    who: 'signed-in',
    description: 'Call on sign-out. Only removes tokens that belong to you.',
    requests: { default: { summary: 'Remove a token', value: { token: 'fcm-registration-token-from-firebase-sdk-0123456789' } } },
    response: { status: 204, description: 'Removed (no body)' },
  },
  'GET /cities': {
    summary: 'Cities we serve',
    who: 'public',
    description: 'Active cities only. Use `id` as `cityId` when saving an address or searching.',
    response: { example: ok([{ id: 1, name: 'Lahore', nameUr: 'لاہور', timezone: 'Asia/Karachi' }, { id: 2, name: 'Karachi', nameUr: 'کراچی', timezone: 'Asia/Karachi' }, { id: 3, name: 'Islamabad', nameUr: 'اسلام آباد', timezone: 'Asia/Karachi' }]) },
  },
  'GET /me/addresses': {
    summary: 'My saved addresses',
    who: 'signed-in',
    description: 'The default address comes first. Deleted addresses are never listed.',
    response: { example: ok([{ ...{ id: ID.address, label: 'Home', line1: '14 Model Town', line2: null, area: 'Model Town', cityId: 1, lat: 31.521, lng: 74.359, isDefault: true, createdAt: '2026-10-22T13:17:36.170Z' } }]) },
  },
  'POST /me/addresses': {
    summary: 'Save an address',
    who: 'signed-in',
    description:
      'The map pin must be **inside Pakistan** and the city must be one from `GET /cities`. Your first address becomes the default automatically. You can keep up to 20.',
    requests: { default: { summary: 'Home in Lahore', value: { label: 'Home', line1: '14 Model Town', area: 'Model Town', cityId: 1, lat: 31.521, lng: 74.359, isDefault: true } } },
    response: { status: 201, description: 'Saved', example: ok({ id: ID.address, label: 'Home', line1: '14 Model Town', line2: null, area: 'Model Town', cityId: 1, lat: 31.521, lng: 74.359, isDefault: true, createdAt: '2026-10-22T13:17:36.170Z' }) },
    errors: [
      { status: 400, code: 'CITY_NOT_AVAILABLE', when: 'We do not serve this city yet.' },
      { status: 400, code: 'LOCATION_OUT_OF_RANGE', when: 'The map pin must be inside Pakistan.' },
      { status: 422, code: 'ADDRESS_LIMIT_REACHED', when: 'You can save up to 20 addresses.' },
    ],
  },
  'PATCH /me/addresses/{id}': {
    summary: 'Edit an address',
    who: 'signed-in',
    description: 'Send only what changes. `isDefault: true` makes this the default; the default cannot be switched off directly (make another address the default instead).',
    params: { id: { example: ID.address, description: 'Address id' } },
    requests: { default: { summary: 'Fix the street', value: { line1: '14-B Model Town' } } },
    response: { example: ok({ id: ID.address, label: 'Home', line1: '14-B Model Town', line2: null, area: 'Model Town', cityId: 1, lat: 31.521, lng: 74.359, isDefault: true, createdAt: '2026-10-22T13:17:36.170Z' }) },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'Address not found (or it is someone else’s).' }],
  },
  'DELETE /me/addresses/{id}': {
    summary: 'Delete an address',
    who: 'signed-in',
    description: 'Soft delete: past orders keep their own copy of the address. If it was the default, the most recent remaining address becomes the default.',
    params: { id: { example: ID.address, description: 'Address id' } },
    response: { status: 204, description: 'Deleted (no body)' },
    errors: [{ status: 404, code: 'NOT_FOUND', when: 'Address not found.' }],
  },
};
