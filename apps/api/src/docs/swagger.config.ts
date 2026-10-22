import { DocumentBuilder, SwaggerCustomOptions } from '@nestjs/swagger';

export const API_TITLE = 'Dhoblio API';

/** Shown at the top of the docs page. Markdown. */
export const API_DESCRIPTION = `
Laundry & dry-cleaning marketplace for Pakistan. Customers order, vendors work the orders, admins run the platform.

## Try it in 30 seconds

1. Open **Auth → Send a login code** → *Try it out* → *Execute*. In development no SMS is sent.
2. Open **Auth → Sign in with the code** → *Try it out* → *Execute* (the code is always \`123456\`).
3. That's it: **the access token is applied automatically** (look at the padlock on the *Authorize* button).
   Every endpoint with a padlock now works as that user. Tokens last 15 minutes; call *Get a new access token* to renew.

| To try… | Sign in as |
|---|---|
| Ordering (customer) | any new phone, e.g. \`03001234567\` |
| The vendor panel | \`03000000011\` (Lahore), \`03000000012\` (Karachi), \`03000000013\` (Islamabad) |
| Vendor review (pending shop) | \`03000000019\` |
| Admin | *Admin sign-in* with \`admin@dhoblio.local\` / \`ChangeMe!12345\` |

A full customer journey: **Find vendors near me** → **Vendor price list** → **Available pickup / delivery windows** → **Price estimate** → **Place an order**.
Then switch to the vendor account to **Accept** it and move it along.

## How responses look

- Success: \`{ "data": … }\`, and lists add \`"meta": { "nextCursor": "…" }\` (pass it as \`?cursor=\`; \`null\` = last page).
- Failure: \`{ "error": { "code", "message", "details?", "requestId" } }\`. Branch on **\`code\`**, not \`message\`. Each endpoint below lists the codes it can return.
- **Money** is a string with two decimals in PKR (\`"1250.00"\`), never a float.
- **Times** are ISO 8601 in UTC (\`2026-10-24T05:00:00.000Z\`); the business day is Pakistan time (UTC+5).
- Sign-in uses a bearer token: \`Authorization: Bearer <accessToken>\`.
- Rate limits answer \`429\` with \`details.retryAfterSec\`.
- Request/response field details are in **Schemas** at the bottom; each field has a description and example.

## Who can do what

| Role | Can |
|---|---|
| Customer | browse, build a cart, place and track orders, manage addresses |
| Vendor owner | register the shop, set hours and prices, work orders, manage staff |
| Vendor staff | work orders and switch Open / Busy / Closed |
| Admin | review vendors, support orders, set city fees |
| Rider | *(delivery module is coming in a later phase)* |
`;

/** Tag order = section order in the UI. */
export const TAGS: [name: string, description: string][] = [
  ['auth', 'Sign in with a phone code (customers, vendors, riders) or email + password (admins), refresh and sign out.'],
  ['me', 'The signed-in user’s own profile, notification channels and push devices.'],
  ['addresses', 'Customer delivery addresses with a map pin.'],
  ['cities', 'The cities we serve.'],
  ['discovery', 'Find vendors and read their pages and price lists. **Public** — no sign-in.'],
  ['slots', 'Pickup and delivery time windows. **Public**.'],
  ['cart', 'The customer’s saved carts and the instant price estimate.'],
  ['orders', 'Customer: place, track (live), cancel, reorder.'],
  ['vendor', 'Vendor onboarding and shop settings: registration, hours, availability, staff.'],
  ['media', 'Signed upload forms for vendor documents (direct to Cloudinary, stored privately).'],
  ['catalog', 'Service categories and each vendor’s price list, including bulk import.'],
  ['vendor-orders', 'The vendor’s order board: accept, reject and move orders through the workflow.'],
  ['admin-vendors', 'Admin: review applications, approve / reject / suspend vendors, audited CNIC access.'],
  ['admin-orders', 'Admin: find any order, see everything, cancel with a reason.'],
  ['admin-cities', 'Admin: delivery fee, active switch and order-number code per city.'],
  ['health', 'Liveness and readiness probes.'],
];

export function createDocumentBuilder(): DocumentBuilder {
  const builder = new DocumentBuilder()
    .setTitle(API_TITLE)
    .setDescription(API_DESCRIPTION)
    .setVersion('1.0')
    .setContact('Dhoblio engineering', '', 'info@ddesignagency.com')
    .addServer('http://localhost:4000', 'Local development')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Applied automatically after you sign in here. Or paste an `accessToken`.' },
      'bearer',
    );
  for (const [name, description] of TAGS) builder.addTag(name, description);
  return builder;
}

/**
 * Runs inside the Swagger page. After a successful sign-in (or refresh) it stores the returned access token in the
 * Authorize dialog, and clears it on sign-out, so "try it out" works across endpoints without copy-pasting.
 */
export const SWAGGER_CUSTOM_JS = `
(function () {
  var TOKEN_URLS = /\\/auth\\/(otp\\/verify|refresh|admin\\/login)$/;
  var LOGOUT_URL = /\\/auth\\/logout$/;
  function toast(text) {
    var el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999;background:#14532d;color:#fff;padding:10px 14px;border-radius:8px;font:14px system-ui,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.25)';
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 3500);
  }
  var realFetch = window.fetch;
  window.fetch = function () {
    var args = arguments;
    return realFetch.apply(this, args).then(function (res) {
      try {
        var input = args[0];
        var url = (typeof input === 'string' ? input : (input && input.url) || '').split('?')[0];
        if (res.ok && window.ui) {
          if (TOKEN_URLS.test(url)) {
            res.clone().json().then(function (body) {
              var token = body && body.data && body.data.accessToken;
              if (token) {
                window.ui.preauthorizeApiKey('bearer', token);
                var u = body.data.user || {};
                toast('Signed in as ' + (u.name || u.email || u.phone || 'user') + ' (' + u.role + ') — token applied');
              }
            }).catch(function () {});
          } else if (LOGOUT_URL.test(url)) {
            window.ui.authActions.logout(['bearer']);
            toast('Signed out — token cleared');
          }
        }
      } catch (e) { /* never break the page */ }
      return res;
    });
  };
})();
`;

export const SWAGGER_CUSTOM_CSS = `
  .swagger-ui .topbar { display: none; }
  .swagger-ui .info .title { font-size: 2rem; }
  .swagger-ui .info .description table { border-collapse: collapse; margin: 8px 0 16px; }
  .swagger-ui .info .description th, .swagger-ui .info .description td { border: 1px solid #d9d9d9; padding: 6px 10px; text-align: left; }
  .swagger-ui .opblock .opblock-summary-description { font-weight: 600; }
  .swagger-ui .opblock-description-wrapper p, .swagger-ui .opblock-description-wrapper li { font-size: 14px; line-height: 1.5; }
`;

export const SWAGGER_UI_OPTIONS: SwaggerCustomOptions = {
  customSiteTitle: 'Dhoblio API docs',
  customCss: SWAGGER_CUSTOM_CSS,
  customJsStr: SWAGGER_CUSTOM_JS,
  swaggerOptions: {
    persistAuthorization: true, // keep the token across page reloads
    tryItOutEnabled: true, // every endpoint is interactive straight away
    displayRequestDuration: true,
    docExpansion: 'none', // start collapsed; open the section you want
    filter: true, // search box
    showCommonExtensions: true,
    defaultModelsExpandDepth: 0, // schemas stay out of the way until opened
    defaultModelExpandDepth: 3,
  },
};
