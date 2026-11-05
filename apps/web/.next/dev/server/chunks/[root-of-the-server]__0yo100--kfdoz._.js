module.exports = [
(()=>{"use strict";return[
"[project]/apps/web/src/i18n/routing.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "LOCALE_LABELS",
    ()=>LOCALE_LABELS,
    "isRtl",
    ()=>isRtl,
    "routing",
    ()=>routing,
    "textDirection",
    ()=>textDirection
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$routing$2f$defineRouting$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__default__as__defineRouting$3e$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/routing/defineRouting.js [middleware] (ecmascript) <export default as defineRouting>");
;
const routing = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$routing$2f$defineRouting$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__default__as__defineRouting$3e$__["defineRouting"])({
    locales: [
        'en',
        'ur'
    ],
    defaultLocale: 'en',
    localePrefix: 'always',
    localeDetection: true
});
const LOCALE_LABELS = {
    en: 'English',
    ur: 'اردو'
};
function isRtl(locale) {
    return locale === 'ur';
}
function textDirection(locale) {
    return isRtl(locale) ? 'rtl' : 'ltr';
}
}),
"[project]/apps/web/src/lib/auth/middleware-refresh.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * A refresh that can run inside middleware.
 *
 * This duplicates a little of src/lib/auth/refresh.ts on purpose: that module is `server-only` and reaches
 * for `next/headers`, neither of which middleware can use. Keeping a small self-contained copy here is
 * cheaper than making the main client runtime-agnostic.
 *
 * Why refresh in middleware at all: the API's access token lives 15 minutes, and a React Server Component
 * cannot set cookies, so an RSC render has no way to persist a rotated token. Without this, an admin who
 * walked away for a coffee would be bounced to the login screen on their next click even though their
 * 30-day refresh token is perfectly good.
 */ __turbopack_context__.s([
    "needsRefresh",
    ()=>needsRefresh,
    "refreshInMiddleware",
    ()=>refreshInMiddleware
]);
/** Refresh this far ahead of expiry, so a slow page render cannot outlive its own token. */ const SKEW_MS = 120_000;
function needsRefresh(session) {
    return session.accessExpiresAt - SKEW_MS <= Date.now();
}
async function refreshInMiddleware(session, apiBaseUrl) {
    let response;
    try {
        response = await fetch(`${apiBaseUrl}/auth/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                // Ask for the rotated refresh token in the body: this app keeps it itself rather than relying on
                // the API's SameSite=Strict cookie, which a different origin cannot use.
                'x-token-transport': 'body'
            },
            body: JSON.stringify({
                refreshToken: session.refreshToken
            }),
            cache: 'no-store',
            signal: AbortSignal.timeout(8_000)
        });
    } catch  {
        // The API is unreachable or slow. Let the request through on the old token; the page's own fetch will
        // produce a proper error. Signing the admin out because of one dropped packet would be worse.
        return {
            status: 'unchanged'
        };
    }
    if (response.status === 401 || response.status === 403) {
        // Definitively rejected: the token was revoked, replayed, or the account was deactivated.
        return {
            status: 'dead'
        };
    }
    if (!response.ok) return {
        status: 'unchanged'
    };
    try {
        const body = await response.json();
        const data = body.data;
        if (!data?.accessToken || !data?.expiresIn) return {
            status: 'unchanged'
        };
        return {
            status: 'refreshed',
            session: {
                accessToken: data.accessToken,
                // If the API rotated the token it comes back here; if it did not, the old one is still current.
                refreshToken: data.refreshToken ?? session.refreshToken,
                accessExpiresAt: Date.now() + data.expiresIn * 1000,
                user: data.user ?? session.user
            }
        };
    } catch  {
        return {
            status: 'unchanged'
        };
    }
}
}),
"[project]/apps/web/src/proxy.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "config",
    ()=>config,
    "default",
    ()=>proxy
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$middleware$2f$middleware$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/middleware/middleware.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$i18n$2f$routing$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/src/i18n/routing.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$auth$2f$middleware$2d$refresh$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/src/lib/auth/middleware-refresh.ts [middleware] (ecmascript)");
;
;
;
;
/**
 * Next 16's `proxy` convention (what earlier versions called `middleware`).
 *
 * Three jobs:
 *  1. Locale prefixing (FE-0.2).
 *  2. The admin route guard (FE-0.6).
 *  3. Refreshing the access token before the page renders, because a React Server Component cannot set
 *     cookies and so cannot persist a rotated refresh token (see lib/auth/middleware-refresh.ts).
 *
 * Admin routes deliberately do NOT go through next-intl's middleware. It was redirecting an already
 * correct `/en/admin/login` back to itself, which is an immediate loop, and the panel does not need what
 * it provides: an admin URL always carries its locale explicitly, so prefixing is a two-line decision
 * made below. Translations are unaffected — they come from `setRequestLocale` plus
 * NextIntlClientProvider in app/[locale]/layout.tsx, not from the middleware.
 *
 * Customer, vendor and rider routes keep next-intl's middleware, which is where locale detection from
 * `Accept-Language` and the `NEXT_LOCALE` cookie genuinely earns its place.
 *
 * The role check below is a UX gate, not a security boundary: the cookie is httpOnly so no script can
 * forge it, but a hand-crafted request could carry anything. Every admin route is enforced server-side by
 * the API's @Roles and @AdminAreaOnly guards, which reload the admin's role from the database per request.
 */ const intlMiddleware = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$middleware$2f$middleware$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["default"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$i18n$2f$routing$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["routing"]);
const SESSION_COOKIE = 'dh_admin_session';
const CUSTOMER_SESSION_COOKIE = 'dh_customer_session';
const VENDOR_SESSION_COOKIE = 'dh_vendor_session';
const API_BASE_URL = (process.env.API_BASE_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');
/** Reachable without a session. Everything else under /admin requires one. */ const PUBLIC_ADMIN_PATHS = [
    '/admin/login'
];
/** The customer sign-in lives outside the customer shell, like /admin/login. */ const PUBLIC_CUSTOMER_PATHS = [
    '/login'
];
/** The vendor sign-in lives outside the vendor shell. */ const PUBLIC_VENDOR_PATHS = [
    '/login'
];
const SESSION_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: ("TURBOPACK compile-time value", "development") === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30
};
function stripLocale(pathname) {
    const match = /^\/([a-z]{2})(\/.*|$)/.exec(pathname);
    if (match && __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$i18n$2f$routing$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["routing"].locales.includes(match[1])) {
        return {
            locale: match[1],
            rest: match[2] || '/'
        };
    }
    return {
        locale: null,
        rest: pathname
    };
}
function parseSession(raw) {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        return parsed?.accessToken && parsed?.refreshToken && parsed?.user?.id ? parsed : null;
    } catch  {
        return null;
    }
}
/** Preferred locale for an admin URL that arrived without a prefix. */ function preferredLocale(request) {
    const cookie = request.cookies.get('NEXT_LOCALE')?.value;
    if (cookie && __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$i18n$2f$routing$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["routing"].locales.includes(cookie)) return cookie;
    return __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$i18n$2f$routing$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["routing"].defaultLocale;
}
function redirectTo(request, pathname, params = {}) {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = '';
    for (const [key, value] of Object.entries(params))url.searchParams.set(key, value);
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].redirect(url);
}
/**
 * Customer guard. The login page is public; everything else needs a customer session. Refreshing here
 * (rather than in the render) is what lets an RSC persist the rotated refresh token — the same reason
 * the admin branch does it.
 */ async function handleCustomer(request, locale, rest) {
    const isPublic = PUBLIC_CUSTOMER_PATHS.some((p)=>rest === p || rest.startsWith(`${p}/`));
    let session = parseSession(request.cookies.get(CUSTOMER_SESSION_COOKIE)?.value);
    if (!session) {
        if (isPublic) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].next();
        return redirectTo(request, `/${locale}/login`, {
            next: `${request.nextUrl.pathname}${request.nextUrl.search}`
        });
    }
    // A vendor or rider account must not get a customer shell full of 403s.
    if (session.user.role !== 'CUSTOMER') {
        const bounce = redirectTo(request, `/${locale}/login`, {
            error: 'not_customer'
        });
        bounce.cookies.set(CUSTOMER_SESSION_COOKIE, '', {
            ...SESSION_COOKIE_OPTIONS,
            maxAge: 0
        });
        return bounce;
    }
    let rotated = null;
    if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$auth$2f$middleware$2d$refresh$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["needsRefresh"])(session)) {
        const outcome = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$auth$2f$middleware$2d$refresh$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["refreshInMiddleware"])(session, API_BASE_URL);
        if (outcome.status === 'dead') {
            const params = {
                error: 'expired'
            };
            if (!isPublic) params.next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
            const bounce = redirectTo(request, `/${locale}/login`, params);
            bounce.cookies.set(CUSTOMER_SESSION_COOKIE, '', {
                ...SESSION_COOKIE_OPTIONS,
                maxAge: 0
            });
            return bounce;
        }
        if (outcome.status === 'refreshed') {
            rotated = outcome.session;
            session = outcome.session;
            request.cookies.set(CUSTOMER_SESSION_COOKIE, JSON.stringify(outcome.session));
        }
    }
    const response = isPublic ? redirectTo(request, `/${locale}`) : __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].next();
    if (rotated) {
        response.cookies.set(CUSTOMER_SESSION_COOKIE, JSON.stringify(rotated), SESSION_COOKIE_OPTIONS);
    }
    return response;
}
/**
 * Vendor guard. Similar to customer guard but for vendor routes (/vendor/*).
 */ async function handleVendor(request, locale, rest) {
    const isPublic = PUBLIC_VENDOR_PATHS.some((p)=>rest === p || rest.startsWith(`${p}/`));
    let session = parseSession(request.cookies.get(VENDOR_SESSION_COOKIE)?.value);
    if (!session) {
        if (isPublic) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].next();
        return redirectTo(request, `/${locale}/login`, {
            next: `${request.nextUrl.pathname}${request.nextUrl.search}`
        });
    }
    // A customer or rider account must not get a vendor shell full of 403s.
    const isVendor = session.user.role === 'VENDOR_OWNER' || session.user.role === 'VENDOR_STAFF';
    if (!isVendor) {
        const bounce = redirectTo(request, `/${locale}/login`, {
            error: 'not_vendor'
        });
        bounce.cookies.set(VENDOR_SESSION_COOKIE, '', {
            ...SESSION_COOKIE_OPTIONS,
            maxAge: 0
        });
        return bounce;
    }
    let rotated = null;
    if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$auth$2f$middleware$2d$refresh$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["needsRefresh"])(session)) {
        const outcome = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$auth$2f$middleware$2d$refresh$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["refreshInMiddleware"])(session, API_BASE_URL);
        if (outcome.status === 'dead') {
            const params = {
                error: 'expired'
            };
            if (!isPublic) params.next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
            const bounce = redirectTo(request, `/${locale}/login`, params);
            bounce.cookies.set(VENDOR_SESSION_COOKIE, '', {
                ...SESSION_COOKIE_OPTIONS,
                maxAge: 0
            });
            return bounce;
        }
        if (outcome.status === 'refreshed') {
            rotated = outcome.session;
            session = outcome.session;
            request.cookies.set(VENDOR_SESSION_COOKIE, JSON.stringify(outcome.session));
        }
    }
    const response = isPublic ? redirectTo(request, `/${locale}`) : __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].next();
    if (rotated) {
        response.cookies.set(VENDOR_SESSION_COOKIE, JSON.stringify(rotated), SESSION_COOKIE_OPTIONS);
    }
    return response;
}
async function proxy(request) {
    const { pathname } = request.nextUrl;
    const { locale, rest } = stripLocale(pathname);
    // Vendor routes: /vendor/*
    if (rest.startsWith('/vendor')) {
        if (!locale) {
            const target = `/${preferredLocale(request)}${rest}`;
            const url = request.nextUrl.clone();
            url.pathname = target;
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].redirect(url);
        }
        return handleVendor(request, locale, rest);
    }
    // Not an admin or vendor route: locale detection first, then the customer guard.
    if (!rest.startsWith('/admin')) {
        if (!locale) return intlMiddleware(request);
        return handleCustomer(request, locale, rest);
    }
    // An admin URL with no locale prefix (/admin/orders): add one and start again.
    if (!locale) {
        const target = `/${preferredLocale(request)}${rest}`;
        const url = request.nextUrl.clone();
        url.pathname = target;
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].redirect(url);
    }
    const isPublic = PUBLIC_ADMIN_PATHS.some((p)=>rest === p || rest.startsWith(`${p}/`));
    let session = parseSession(request.cookies.get(SESSION_COOKIE)?.value);
    if (!session) {
        if (isPublic) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].next();
        return redirectTo(request, `/${locale}/admin/login`, {
            next: `${pathname}${request.nextUrl.search}`
        });
    }
    // Signed in as someone who is not an admin: clear it rather than render a shell full of 403s.
    if (session.user.role !== 'ADMIN') {
        const bounce = redirectTo(request, `/${locale}/admin/login`, {
            error: 'not_admin'
        });
        bounce.cookies.set(SESSION_COOKIE, '', {
            ...SESSION_COOKIE_OPTIONS,
            maxAge: 0
        });
        return bounce;
    }
    let rotated = null;
    if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$auth$2f$middleware$2d$refresh$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["needsRefresh"])(session)) {
        const outcome = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$auth$2f$middleware$2d$refresh$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["refreshInMiddleware"])(session, API_BASE_URL);
        if (outcome.status === 'dead') {
            const params = {
                error: 'expired'
            };
            if (!isPublic) params.next = `${pathname}${request.nextUrl.search}`;
            const bounce = redirectTo(request, `/${locale}/admin/login`, params);
            bounce.cookies.set(SESSION_COOKIE, '', {
                ...SESSION_COOKIE_OPTIONS,
                maxAge: 0
            });
            return bounce;
        }
        if (outcome.status === 'refreshed') {
            rotated = outcome.session;
            session = outcome.session;
            // Hand the fresh token to this same render. Mutating the request cookie rewrites the Cookie header
            // Next forwards downstream, so the RSC tree below reads the new token rather than the spent one.
            request.cookies.set(SESSION_COOKIE, JSON.stringify(outcome.session));
        }
    // 'unchanged' (API down, or a transient error): proceed on the old token and let the page surface it.
    }
    // Already signed in and asking for the login page: send them to the panel.
    const response = isPublic ? redirectTo(request, `/${locale}/admin`) : __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].next();
    // Persist the rotation for the browser. Without this the next navigation would present the spent token,
    // which the API treats as replay and would revoke the whole chain.
    if (rotated) response.cookies.set(SESSION_COOKIE, JSON.stringify(rotated), SESSION_COOKIE_OPTIONS);
    return response;
}
const config = {
    /**
   * Skip Next internals, the BFF proxy (it handles its own session and must not be locale-routed) and
   * anything that looks like a static file.
   */ matcher: [
        '/((?!api|_next|_vercel|.*\\..*).*)'
    ]
};
}),
]})(),
"[externals]/crypto [external] (crypto, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("crypto", () => require("crypto"));

module.exports = mod;
}),
"[externals]/next/dist/build/adapter/setup-node-env.external.js [external] (next/dist/build/adapter/setup-node-env.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/build/adapter/setup-node-env.external.js", () => require("next/dist/build/adapter/setup-node-env.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/action-async-storage.external.js [external] (next/dist/server/app-render/action-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/action-async-storage.external.js", () => require("next/dist/server/app-render/action-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/lib/incremental-cache/memory-cache.external.js [external] (next/dist/server/lib/incremental-cache/memory-cache.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/lib/incremental-cache/memory-cache.external.js", () => require("next/dist/server/lib/incremental-cache/memory-cache.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/lib/incremental-cache/shared-cache-controls.external.js [external] (next/dist/server/lib/incremental-cache/shared-cache-controls.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/lib/incremental-cache/shared-cache-controls.external.js", () => require("next/dist/server/lib/incremental-cache/shared-cache-controls.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/lib/incremental-cache/tags-manifest.external.js [external] (next/dist/server/lib/incremental-cache/tags-manifest.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/lib/incremental-cache/tags-manifest.external.js", () => require("next/dist/server/lib/incremental-cache/tags-manifest.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/lib/router-utils/instrumentation-globals.external.js [external] (next/dist/server/lib/router-utils/instrumentation-globals.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/lib/router-utils/instrumentation-globals.external.js", () => require("next/dist/server/lib/router-utils/instrumentation-globals.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/runtime-reacts.external.js [external] (next/dist/server/runtime-reacts.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/runtime-reacts.external.js", () => require("next/dist/server/runtime-reacts.external.js"));

module.exports = mod;
}),
"[externals]/node:async_hooks [external] (node:async_hooks, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:async_hooks", () => require("node:async_hooks"));

module.exports = mod;
}),
"[externals]/node:path [external] (node:path, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:path", () => require("node:path"));

module.exports = mod;
}),
"[externals]/node:stream [external] (node:stream, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:stream", () => require("node:stream"));

module.exports = mod;
}),
"[externals]/path [external] (path, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("path", () => require("path"));

module.exports = mod;
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__0yo100--kfdoz._.js.map