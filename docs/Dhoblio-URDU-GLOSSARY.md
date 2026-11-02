# Dhoblio — Urdu copy: house style and glossary

**Who owns this:** the engineering side drafts all Urdu UI copy against this file. A native-speaker pass
is still required before pilot launch, but only for the narrow slice named in §6 — not for every string.

**Why it exists:** the API already sends bilingual notifications to real customers
(`apps/api/src/modules/notifications/templates/order-templates.ts`). That copy set the house style
months before the web app existed. This file writes that style down so the customer, vendor and rider
UIs inherit it instead of each inventing their own Urdu for "order".

It is enforced, not advisory: `apps/api/src/common/urdu-glossary.spec.ts` fails the build if a term here
is contradicted anywhere in the repo.

---

## 1. The register: Pakistani Urdu, not literary Urdu

This is the single most common way Urdu localization goes wrong, so it is the first rule.

Pakistani users of a service app expect **transliterated English loanwords** for anything technical or
commercial. Reaching for a "purer" Urdu word makes the product read as foreign and officious, which is
the opposite of the intent.

| Concept | Use | Do **not** use | Why |
|---|---|---|---|
| order | آرڈر | حکم / فرمائش | آرڈر is what people say and type |
| delivery | ڈیلیوری | ترسیل / رسانی | ترسیل reads like a government form |
| pickup | پک اپ | وصولی | وصولی means collection of money |
| rider | رائیڈر | سوار / قاصد | سوار is a horseman |
| code | کوڈ | رمز | رمز is literary |
| app | ایپ | اطلاقیہ | nobody says this |
| online / cash | آن لائن / کیش | — | both are standard |

**Numbers and money stay in Latin digits.** `Rs 1,250`, not Urdu-Indic numerals. The API's templates
already do this (`Rs {total}`), and a payout sheet in ١٢٥٠ is a support ticket. The web app enforces it
in `packages/shared/src/money.ts`, which formats with `en-PK` deliberately.

**Sentence-final punctuation is the Urdu full stop `۔`**, not `.`. The API's templates are consistent on
this; match them.

---

## 2. Brand name

| | Correct | Wrong |
|---|---|---|
| English | **Dhoblio** | ~~Dhobilo~~ |
| Urdu | **ڈھوبلیو** | ~~ڈھوبیلو~~ |

Both wrong forms were live in this repo and are fixed: `Dhobilo` appeared in a customer-facing error
message (`RIDER_REVIEW_UNAVAILABLE`), and the Urdu form had its letters transposed in the web app's
`ur.json`. The GitHub repository is genuinely named `Dhobilo`, so URLs keep that spelling — that is the
only permitted occurrence.

---

## 3. Domain glossary

Lifted from the shipping notification templates where one exists there, so these are already in front of
customers. Add a row before inventing a term; do not translate twice.

### Order lifecycle

| English | Urdu | Notes |
|---|---|---|
| order placed | آرڈر بھیج دیا گیا | "sent" reads better than "placed" |
| order accepted | آرڈر قبول ہو گیا | |
| order rejected | آرڈر قبول نہیں ہوا | softer than مسترد; the customer did nothing wrong |
| order cancelled | آرڈر منسوخ | |
| picked up | کپڑے وصول ہو گئے | "clothes received" — concrete beats literal |
| in process | کام شروع ہو گیا | "work has started" |
| ready | آرڈر تیار ہے | |
| out for delivery | ڈیلیوری کے لیے روانہ | |
| delivered | آرڈر ڈیلیور ہو گیا | |

### People and places

| English | Urdu |
|---|---|
| customer | کسٹمر |
| vendor / shop | دکان |
| rider | رائیڈر |
| city | شہر |
| address | پتہ |

### Money

| English | Urdu |
|---|---|
| total | کل |
| delivery fee | ڈیلیوری فیس |
| discount | رعایت |
| refund | رقم کی واپسی |
| cash on delivery | ڈیلیوری پر ادائیگی |
| payment | ادائیگی |

### Service types

| English | Urdu |
|---|---|
| wash & fold | دھلائی اور تہہ |
| wash & iron | دھلائی اور استری |
| dry cleaning | ڈرائی کلیننگ |
| iron only | صرف استری |

Already in the seed data (`apps/api/prisma/seed.ts`); the customer app must match, since these are the
category names customers browse.

### Cities

| English | Urdu |
|---|---|
| Lahore | لاہور |
| Karachi | کراچی |
| Islamabad | اسلام آباد |

Stored on the `City` row as `nameUr`, so they come from the database, not from a message file.

---

## 4. Tone

- **Address the customer as آپ**, never تم. The API's templates are consistent on this.
- **Apologise plainly, once.** `معذرت` at the start of a failure, then say what happens next. No
  elaborate formulae.
- **Say what to do, not what went wrong.** "ایپ کھولیں اور {minutes} منٹ میں قبول کریں" beats a
  description of the timeout.
- **Thank once, at delivery only.** The templates do this (`شکریہ` on delivery) and nowhere else, which
  is why it still means something.

---

## 5. Layout, not language

RTL problems get mistaken for translation problems. Before reporting copy as broken, check:

- Logical CSS properties only — `ms-*`/`me-*`/`ps-*`/`pe-*`/`start-*`/`end-*`, and `text-start`. Never
  `text-left`. The web app is clean on this; a grep in CI would keep it that way.
- Urdu needs more line height than Latin. `apps/web/src/styles/globals.css` sets `line-height: 2.1` for
  `[lang='ur']` because Nastaliq descenders collide at Inter's comfortable spacing.
- The Nastaliq font is large and is loaded **only** for `ur`, to protect the 3G budget in TRD §16.2.
- Phone numbers, emails, order numbers, IBANs and transaction references are `dir="ltr"` even inside RTL
  text, or the digits reorder on screen.

---

## 6. What still needs a human before launch

The engineering side can draft and own everything above. Two things it cannot sign off, and neither is a
translation problem:

1. **Legal pages — Terms, Privacy, Refund/Cancellation, and the vendor agreement.** These need a
   Pakistani lawyer, in both languages, because the Urdu version is the one a customer in Lahore will
   rely on. This already sits with the business side as tracker item X-5; it is not FE work and should
   not be waiting on FE.
2. **Brand and marketing voice** — the handful of strings that sell rather than inform: the app store
   listing, onboarding screens, the referral invite. A native speaker with a view on the brand should
   read those, which is a short pass over perhaps thirty strings, not a review of the whole catalogue.

Everything else — status messages, form labels, errors, empty states — is drafted against this file and
guarded by the spec. Keeping the sign-off this narrow is the point: an open-ended "get the Urdu reviewed"
blocks launch, whereas "a lawyer reads four documents and a native speaker reads thirty marketing
strings" is schedulable work.

**Admin panel:** English only by decision. `ur.json` mirrors every `en.json` key so no screen can hit a
missing key, and the Urdu can be filled in later with no code change. Admin users are internal staff who
work in English; this is not a gap to close before launch.
