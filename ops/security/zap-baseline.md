# ZAP security scan (BE-9.8)

**Run:** OWASP ZAP `zap-api-scan.py` (image `ghcr.io/zaproxy/zaproxy:stable`) against the API's OpenAPI document
(`apps/api/openapi.json`), on a throwaway API instance with an empty database, using an admin bearer token so
protected routes were exercised too. 2026-11-06.

**Result:** 120 checks, 0 FAIL, 0 WARN. Only informational notes remain, all expected:

| Note | Why it is fine |
|---|---|
| A client error response code was returned | the scan sends invalid input on purpose; the API answers 4xx |
| Non-storable content | API responses carry `Cache-Control: no-store` on purpose |
| Authentication / session management response identified | the login endpoints, as designed |

**Web app (manual header check, `apps/web/next.config.ts`):** already had `X-Frame-Options`, `X-Content-Type-Options`,
`Referrer-Policy`, `Permissions-Policy`, `no-store` on the admin panel, and no `X-Powered-By`. Added
`Cross-Origin-Opener-Policy`, a directive-only `Content-Security-Policy` (`frame-ancestors`, `base-uri`, `object-src`,
`form-action`) and `Strict-Transport-Security` in production.

**Not done / follow-ups**
- A script-restricting CSP needs per-request nonces with Next.js; do it once, test the whole app, then enforce it.
- Run the same scan against staging over HTTPS (it also checks HSTS and cookie flags on the real deployment).
- ZAP does not cover business-logic abuse (price tampering, IDOR across roles). That is the pen-test (OPS-9.2).

**Repeat:** `docker run --rm --network host -v $PWD/out:/zap/wrk:rw ghcr.io/zaproxy/zaproxy:stable zap-api-scan.py -t <openapi-url-or-file> -f openapi -O <api-base-url> -J report.json -z "<replacer config adding the Authorization header>"`
