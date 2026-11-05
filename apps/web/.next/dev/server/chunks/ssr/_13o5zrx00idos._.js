(()=>{"use strict";module.exports = [
"[project]/apps/web/.next-internal/server/app/[locale]/login/page/actions.js { ACTIONS_MODULE0 => \"[project]/apps/web/src/lib/customer/actions.ts [app-rsc] (ecmascript)\" } [app-rsc] (server actions loader, ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "70830836277ddcf54d41bcbf99a3018ed035e93d4e",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$customer$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["requestOtp"],
    "78ef0f9344b101a0a7a3e038adc7e9414829ad8cce",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$customer$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["verifyOtp"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f2e$next$2d$internal$2f$server$2f$app$2f5b$locale$5d2f$login$2f$page$2f$actions$2e$js__$7b$__ACTIONS_MODULE0__$3d3e$__$225b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$customer$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$2922$__$7d$__$5b$app$2d$rsc$5d$__$28$server__actions__loader$2c$__ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i('[project]/apps/web/.next-internal/server/app/[locale]/login/page/actions.js { ACTIONS_MODULE0 => "[project]/apps/web/src/lib/customer/actions.ts [app-rsc] (ecmascript)" } [app-rsc] (server actions loader, ecmascript) <locals>');
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$customer$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/src/lib/customer/actions.ts [app-rsc] (ecmascript)");
}),
"[project]/apps/web/.next-internal/server/app/[locale]/login/page/actions.js { ACTIONS_MODULE0 => \"[project]/apps/web/src/lib/customer/actions.ts [app-rsc] (ecmascript)\" } [app-rsc] (server actions loader, ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$customer$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/src/lib/customer/actions.ts [app-rsc] (ecmascript)");
;
;
}),
"[project]/apps/web/src/lib/api/config.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "API_BASE_URL",
    ()=>API_BASE_URL,
    "REQUEST_TIMEOUT_MS",
    ()=>REQUEST_TIMEOUT_MS,
    "TOKEN_TRANSPORT_HEADER",
    ()=>TOKEN_TRANSPORT_HEADER,
    "apiUrl",
    ()=>apiUrl
]);
;
const API_BASE_URL = (process.env.API_BASE_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');
const TOKEN_TRANSPORT_HEADER = {
    'x-token-transport': 'body'
};
const REQUEST_TIMEOUT_MS = Number(process.env.API_TIMEOUT_MS ?? 20_000);
function apiUrl(path, query) {
    const url = new URL(`${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`);
    if (query) {
        for (const [key, value] of Object.entries(query)){
            if (value === undefined || value === null || value === '') continue;
            if (Array.isArray(value)) {
                for (const v of value)if (v !== undefined && v !== null && v !== '') url.searchParams.append(key, String(v));
            } else {
                url.searchParams.set(key, String(value));
            }
        }
    }
    return url.toString();
}
}),
"[project]/apps/web/src/lib/api/errors.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ApiError",
    ()=>ApiError,
    "ApiUnreachableError",
    ()=>ApiUnreachableError,
    "isApiError",
    ()=>isApiError
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/shared/src/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$error$2d$codes$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/shared/src/error-codes.ts [app-rsc] (ecmascript)");
;
class ApiError extends Error {
    status;
    code;
    details;
    requestId;
    constructor(status, body, fallback){
        const code = body?.code ?? 'INTERNAL_ERROR';
        super((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$error$2d$codes$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["adminErrorMessage"])(code, body?.message ?? fallback));
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.details = body?.details;
        this.requestId = body?.requestId;
    }
    get isRetryable() {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$error$2d$codes$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["isRetryableErrorCode"])(this.code);
    }
    /** The session is gone: clear it and send the admin to the login screen. */ get isSessionExpired() {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$error$2d$codes$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["isSessionErrorCode"])(this.code) || this.status === 401;
    }
    /** Signed in, but not allowed here. Re-login will not help; this is a wrong-role or wrong-area call. */ get isForbidden() {
        return this.code === 'FORBIDDEN' || this.status === 403;
    }
    get isAccountProblem() {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$error$2d$codes$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["isAccountErrorCode"])(this.code);
    }
    get isNotFound() {
        return this.status === 404;
    }
    get fieldErrors() {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$error$2d$codes$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["validationDetails"])(this.details);
    }
    get validationSummary() {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$error$2d$codes$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["validationSummary"])(this.details);
    }
    /** Safe to show an admin, including the trace handle. */ toDisplay() {
        return {
            message: this.message,
            code: this.code,
            requestId: this.requestId
        };
    }
}
class ApiUnreachableError extends Error {
    constructor(cause){
        super('Could not reach the Dhoblio API. Check your connection and try again.');
        this.name = 'ApiUnreachableError';
        this.cause = cause;
    }
}
function isApiError(e) {
    return e instanceof ApiError;
}
}),
"[project]/apps/web/src/lib/api/fetch.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "apiFetch",
    ()=>apiFetch
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2f$config$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/src/lib/api/config.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2f$errors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/src/lib/api/errors.ts [app-rsc] (ecmascript)");
;
;
;
const DEFAULT_RETRIES = 2;
function backoffMs(attempt, retryAfterHeader) {
    const fromHeader = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
    if (Number.isFinite(fromHeader) && fromHeader > 0) return Math.min(fromHeader, 8_000);
    // 400ms, 1200ms, with jitter so a wave of admins does not retry in lockstep.
    return Math.min(400 * 3 ** attempt, 6_000) + Math.random() * 250;
}
const sleep = (ms)=>new Promise((r)=>setTimeout(r, ms));
async function apiFetch(path, options = {}) {
    const { method = 'GET', query, body, accessToken, headers = {}, cache, revalidate, tags, signal, retries = DEFAULT_RETRIES, timeoutMs = __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2f$config$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["REQUEST_TIMEOUT_MS"] } = options;
    const url = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2f$config$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["apiUrl"])(path, query);
    let lastError;
    for(let attempt = 0; attempt <= retries; attempt++){
        const timeout = AbortSignal.timeout(timeoutMs);
        const composed = signal ? AbortSignal.any([
            signal,
            timeout
        ]) : timeout;
        let response;
        try {
            response = await fetch(url, {
                method,
                headers: {
                    Accept: 'application/json',
                    ...body !== undefined ? {
                        'Content-Type': 'application/json'
                    } : {},
                    ...accessToken ? {
                        Authorization: `Bearer ${accessToken}`
                    } : {},
                    ...headers
                },
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: composed,
                ...cache ? {
                    cache
                } : {},
                ...revalidate !== undefined || tags ? {
                    next: {
                        revalidate,
                        tags
                    }
                } : {}
            });
        } catch (cause) {
            // A timeout or a refused connection. Retry GETs; a failed mutation must surface, because we cannot
            // know whether the server applied it.
            if (method === 'GET' && attempt < retries) {
                await sleep(backoffMs(attempt, null));
                continue;
            }
            throw new __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2f$errors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["ApiUnreachableError"](cause);
        }
        if (response.status === 204) return {
            data: undefined
        };
        const text = await response.text();
        let parsed;
        try {
            parsed = text ? JSON.parse(text) : undefined;
        } catch  {
            parsed = undefined;
        }
        if (response.ok) {
            const envelope = parsed;
            // Raw responses (file downloads, SSE) opt out of the envelope; fall back to the parsed body.
            const hasEnvelope = !!envelope && typeof envelope === 'object' && 'data' in envelope;
            return {
                data: hasEnvelope ? envelope.data : parsed,
                meta: hasEnvelope ? envelope.meta : undefined
            };
        }
        const errorBody = parsed?.error;
        const error = new __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2f$errors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["ApiError"](response.status, errorBody, response.statusText);
        if (error.isRetryable && attempt < retries) {
            lastError = error;
            await sleep(backoffMs(attempt, response.headers.get('Retry-After')));
            continue;
        }
        throw error;
    }
    throw lastError ?? new __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2f$errors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["ApiUnreachableError"]();
}
}),
"[project]/apps/web/src/lib/auth/refresh.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "refreshFailedTerminally",
    ()=>refreshFailedTerminally,
    "refreshSession",
    ()=>refreshSession
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2f$config$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/src/lib/api/config.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2f$fetch$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/src/lib/api/fetch.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2f$errors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/src/lib/api/errors.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$auth$2f$session$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/src/lib/auth/session.ts [app-rsc] (ecmascript)");
;
;
;
;
;
/**
 * Refresh-token rotation makes concurrent refreshes dangerous.
 *
 * The API rotates the refresh token on every /auth/refresh and revokes the whole chain if an already-used
 * token is presented again (that is how it detects theft). A single page render can fire a dozen parallel
 * API calls; if each noticed an expired access token and refreshed independently, the first would succeed
 * and the rest would present a spent token — logging the admin out and, worse, looking like an attack in
 * the audit log.
 *
 * So refreshes are deduplicated by the token being spent: everyone who arrives with the same refresh
 * token shares one in-flight request and one result.
 *
 * This map is per server instance. With several replicas two instances could still race, but only if the
 * same admin's requests land on both within the same second AND the access token expired in that window;
 * the loser gets one UNAUTHENTICATED and is sent to the login screen. Middleware refreshing ahead of the
 * render (see src/middleware.ts) is what keeps that from being a routine event.
 */ const inFlight = new Map();
async function refreshSession(session) {
    const existing = inFlight.get(session.refreshToken);
    if (existing) return existing;
    const pending = (async ()=>{
        try {
            const { data } = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2f$fetch$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["apiFetch"])('/auth/refresh', {
                method: 'POST',
                // Body transport, not the cookie: the panel holds the refresh token itself. Sending it in the
                // body also means the API's CSRF origin check does not apply, which is correct for a
                // server-to-server call that no browser can forge.
                body: {
                    refreshToken: session.refreshToken
                },
                headers: {
                    ...__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2f$config$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["TOKEN_TRANSPORT_HEADER"]
                },
                // Never retry a refresh: a second attempt would present a token the first attempt already spent.
                retries: 0
            });
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$auth$2f$session$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["sessionFromAuthResponse"])(data, session.refreshToken);
        } finally{
            inFlight.delete(session.refreshToken);
        }
    })();
    inFlight.set(session.refreshToken, pending);
    return pending;
}
function refreshFailedTerminally(error) {
    return error instanceof __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2f$errors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["ApiError"] && (error.isSessionExpired || error.isAccountProblem);
}
}),
"[project]/apps/web/src/lib/auth/session.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "REFRESH_SKEW_MS",
    ()=>REFRESH_SKEW_MS,
    "SESSION_COOKIE",
    ()=>SESSION_COOKIE,
    "accessTokenIsFresh",
    ()=>accessTokenIsFresh,
    "clearSession",
    ()=>clearSession,
    "isSecureDeployment",
    ()=>isSecureDeployment,
    "readSession",
    ()=>readSession,
    "sessionFromAuthResponse",
    ()=>sessionFromAuthResponse,
    "writeSession",
    ()=>writeSession
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/headers.js [app-rsc] (ecmascript)");
;
;
const SESSION_COOKIE = 'dh_admin_session';
const REFRESH_SKEW_MS = 60_000;
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // matches the API's refresh-token lifetime
function cookieOptions(secure) {
    return {
        httpOnly: true,
        secure,
        // Lax, not Strict: an admin following a deep link from email or chat must arrive signed in.
        // Safe here because the browser never carries a token to the API — only to this app's own server,
        // and every mutation goes through a POST route handler, not a GET.
        sameSite: 'lax',
        path: '/',
        maxAge: MAX_AGE_SECONDS
    };
}
function isSecureDeployment() {
    return ("TURBOPACK compile-time value", "development") === 'production';
}
async function readSession() {
    const raw = (await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cookies"])()).get(SESSION_COOKIE)?.value;
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (!parsed?.accessToken || !parsed?.refreshToken || !parsed?.user?.id) return null;
        return parsed;
    } catch  {
        // A truncated or tampered cookie is treated as "not signed in" rather than crashing the render.
        return null;
    }
}
async function writeSession(session) {
    (await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cookies"])()).set(SESSION_COOKIE, JSON.stringify(session), cookieOptions(isSecureDeployment()));
}
async function clearSession() {
    (await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cookies"])()).set(SESSION_COOKIE, '', {
        ...cookieOptions(isSecureDeployment()),
        maxAge: 0
    });
}
function sessionFromAuthResponse(body, previousRefreshToken) {
    const refreshToken = body.refreshToken ?? previousRefreshToken;
    if (!refreshToken) {
        // Without `x-token-transport: body` the API only sets the cookie, which this app cannot use.
        throw new Error('The API did not return a refresh token in the body; the transport header is missing.');
    }
    return {
        accessToken: body.accessToken,
        refreshToken,
        accessExpiresAt: Date.now() + body.expiresIn * 1000,
        user: body.user
    };
}
function accessTokenIsFresh(session) {
    return session.accessExpiresAt - REFRESH_SKEW_MS > Date.now();
}
}),
"[project]/apps/web/src/lib/customer/actions.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/* __next_internal_action_entry_do_not_use__ [{"40e19e47eebd3e743d2785fdad46905c35f550330d":{"name":"signOutCustomer"},"6027ccf19aa18cbe34857df793833a72f998addf56":{"name":"changeCustomerLanguage"},"70830836277ddcf54d41bcbf99a3018ed035e93d4e":{"name":"requestOtp"},"70e0cf980ab055a9e13717432c442254b526b47031":{"name":"updateCustomerProfile"},"78ef0f9344b101a0a7a3e038adc7e9414829ad8cce":{"name":"verifyOtp"}},"apps/web/src/lib/customer/actions.ts",""] */ __turbopack_context__.s([
    "changeCustomerLanguage",
    ()=>changeCustomerLanguage,
    "requestOtp",
    ()=>requestOtp,
    "signOutCustomer",
    ()=>signOutCustomer,
    "updateCustomerProfile",
    ()=>updateCustomerProfile,
    "verifyOtp",
    ()=>verifyOtp
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/server-reference.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$api$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/next/dist/api/navigation.react-server.js [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/components/navigation.react-server.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-rsc] (ecmascript) <export * as z .string>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2f$config$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/src/lib/api/config.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2f$errors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/src/lib/api/errors.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2f$fetch$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/src/lib/api/fetch.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$i18n$2f$routing$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/src/i18n/routing.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$customer$2f$server$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/src/lib/customer/server.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$customer$2f$session$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/apps/web/src/lib/customer/session.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$auth$2f$session$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/src/lib/auth/session.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$validate$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/action-validate.js [app-rsc] (ecmascript)");
;
;
;
;
;
;
;
;
;
const phoneSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().min(10).max(20);
const codeSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().regex(/^\d{6}$/);
function toError(error) {
    if (error instanceof __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2f$errors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["ApiError"]) return error.toDisplay();
    if (error instanceof __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2f$errors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["ApiUnreachableError"]) return {
        code: 'API_UNREACHABLE',
        message: error.message
    };
    throw error;
}
/** Only ever return to a path on this site, and never back to the login or admin app. */ function safeReturnTo(next, locale) {
    const fallback = `/${locale}`;
    if (!next) return fallback;
    if (!next.startsWith('/') || next.startsWith('//')) return fallback;
    const rest = next.replace(/^\/[a-z]{2}(?=\/|$)/, '');
    if (!rest || rest === '/') return fallback;
    if (rest.startsWith('/login') || rest.startsWith('/admin')) return fallback;
    return next;
}
async function requestOtp(_locale, _prev, formData) {
    const parsed = phoneSchema.safeParse(formData.get('phone'));
    if (!parsed.success) {
        return {
            error: {
                code: 'VALIDATION_FAILED',
                message: 'Enter a valid phone number.'
            }
        };
    }
    try {
        const { data } = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2f$fetch$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["apiFetch"])('/auth/otp/request', {
            method: 'POST',
            body: {
                phone: parsed.data
            },
            retries: 0
        });
        return {
            step: 'code',
            phone: parsed.data,
            expiresInSeconds: data.expiresInSeconds
        };
    } catch (error) {
        return {
            step: 'phone',
            error: toError(error)
        };
    }
}
async function verifyOtp(locale, next, _prev, formData) {
    const phone = phoneSchema.safeParse(formData.get('phone'));
    const code = codeSchema.safeParse(formData.get('code'));
    if (!phone.success || !code.success) {
        return {
            error: {
                code: 'VALIDATION_FAILED',
                message: 'Enter the 6-digit code.'
            }
        };
    }
    let destination;
    try {
        const { data } = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2f$fetch$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["apiFetch"])('/auth/otp/verify', {
            method: 'POST',
            body: {
                phone: phone.data,
                code: code.data,
                role: 'CUSTOMER'
            },
            headers: {
                ...__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2f$config$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["TOKEN_TRANSPORT_HEADER"]
            },
            retries: 0
        });
        // A vendor or rider token must not become a customer session; their apps are separate.
        if (data.user.role !== 'CUSTOMER') {
            return {
                step: 'phone',
                error: {
                    code: 'NOT_CUSTOMER',
                    message: 'This number belongs to a vendor or staff account. Use the right app.'
                }
            };
        }
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$customer$2f$session$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["writeCustomerSession"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$auth$2f$session$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["sessionFromAuthResponse"])(data));
        destination = safeReturnTo(next, locale);
    } catch (error) {
        return {
            step: 'code',
            error: toError(error)
        };
    }
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["redirect"])(destination);
}
async function signOutCustomer(locale) {
    const session = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$customer$2f$session$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["readCustomerSession"])();
    if (session) {
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2f$fetch$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["apiFetch"])('/auth/logout', {
                method: 'POST',
                body: {
                    refreshToken: session.refreshToken
                },
                accessToken: session.accessToken,
                retries: 0
            });
        } catch  {
        // The API being unreachable must not trap the customer in a session they asked to end.
        }
    }
    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$customer$2f$session$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["clearCustomerSession"])();
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["redirect"])(`/${locale}/login`);
}
async function updateCustomerProfile(locale, _prev, formData) {
    const name = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().min(1).max(80).safeParse(formData.get('name') ?? '');
    if (!name.success) {
        return {
            error: {
                code: 'VALIDATION_FAILED',
                message: 'Enter your name (up to 80 characters).'
            }
        };
    }
    try {
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$customer$2f$server$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["mutateCustomerApi"])('/me', {
            method: 'PATCH',
            body: {
                name: name.data
            },
            retries: 0
        });
        return {
            ok: true
        };
    } catch (error) {
        return {
            error: toError(error)
        };
    }
}
async function changeCustomerLanguage(locale, nextLocale) {
    if (!__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$i18n$2f$routing$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["routing"].locales.includes(nextLocale)) {
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["redirect"])(`/${locale}/profile`);
    }
    try {
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$customer$2f$server$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["mutateCustomerApi"])('/me', {
            method: 'PATCH',
            body: {
                locale: nextLocale === 'ur' ? 'UR' : 'EN'
            },
            retries: 0
        });
    } catch  {
    // The language still changes for this browser session even if the API is down; the next save
    // will persist it.
    }
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["redirect"])(`/${nextLocale}/profile`);
}
;
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$validate$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["ensureServerEntryExports"])([
    requestOtp,
    verifyOtp,
    signOutCustomer,
    updateCustomerProfile,
    changeCustomerLanguage
]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(requestOtp, "70830836277ddcf54d41bcbf99a3018ed035e93d4e", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(verifyOtp, "78ef0f9344b101a0a7a3e038adc7e9414829ad8cce", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(signOutCustomer, "40e19e47eebd3e743d2785fdad46905c35f550330d", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(updateCustomerProfile, "70e0cf980ab055a9e13717432c442254b526b47031", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(changeCustomerLanguage, "6027ccf19aa18cbe34857df793833a72f998addf56", null);
}),
"[project]/apps/web/src/lib/customer/server.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "CustomerSessionRequiredError",
    ()=>CustomerSessionRequiredError,
    "currentCustomer",
    ()=>currentCustomer,
    "customerLoginPath",
    ()=>customerLoginPath,
    "fetchCustomerApi",
    ()=>fetchCustomerApi,
    "fetchForCustomerPage",
    ()=>fetchForCustomerPage,
    "mutateCustomerApi",
    ()=>mutateCustomerApi
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$api$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/next/dist/api/navigation.react-server.js [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/components/navigation.react-server.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$auth$2f$refresh$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/src/lib/auth/refresh.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2f$errors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/src/lib/api/errors.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2f$fetch$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/src/lib/api/fetch.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$customer$2f$session$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/apps/web/src/lib/customer/session.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$auth$2f$session$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/src/lib/auth/session.ts [app-rsc] (ecmascript)");
;
;
;
;
;
;
class CustomerSessionRequiredError extends Error {
    constructor(){
        super('No customer session');
        this.name = 'CustomerSessionRequiredError';
    }
}
async function fetchCustomerApi(path, options = {}) {
    const session = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$customer$2f$session$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["readCustomerSession"])();
    if (!session) throw new CustomerSessionRequiredError();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2f$fetch$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["apiFetch"])(path, {
        ...options,
        accessToken: session.accessToken
    });
}
async function fetchForCustomerPage(path, options = {
    locale: 'en'
}) {
    const { locale, returnTo, ...rest } = options;
    try {
        return await fetchCustomerApi(path, rest);
    } catch (error) {
        if (error instanceof CustomerSessionRequiredError || error instanceof __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2f$errors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["ApiError"] && error.isSessionExpired) {
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["redirect"])(customerLoginPath(locale, returnTo));
        }
        throw error;
    }
}
function customerLoginPath(locale, returnTo) {
    const base = `/${locale}/login`;
    return returnTo ? `${base}?next=${encodeURIComponent(returnTo)}` : base;
}
async function mutateCustomerApi(path, options = {}) {
    let session = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$customer$2f$session$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["readCustomerSession"])();
    if (!session) throw new CustomerSessionRequiredError();
    if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$auth$2f$session$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["accessTokenIsFresh"])(session)) {
        session = await refreshAndPersist(session);
    }
    try {
        return await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2f$fetch$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["apiFetch"])(path, {
            ...options,
            accessToken: session.accessToken
        });
    } catch (error) {
        if (error instanceof __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2f$errors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["ApiError"] && error.isSessionExpired) {
            const refreshed = await refreshAndPersist(session);
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2f$fetch$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["apiFetch"])(path, {
                ...options,
                accessToken: refreshed.accessToken
            });
        }
        throw error;
    }
}
async function refreshAndPersist(session) {
    try {
        const next = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$auth$2f$refresh$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["refreshSession"])(session);
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$customer$2f$session$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["writeCustomerSession"])(next);
        return next;
    } catch (error) {
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$customer$2f$session$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["clearCustomerSession"])();
        throw error instanceof __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2f$errors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["ApiError"] ? error : new CustomerSessionRequiredError();
    }
}
async function currentCustomer() {
    const session = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$customer$2f$session$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["readCustomerSession"])();
    return session?.user ?? null;
}
}),
"[project]/apps/web/src/lib/customer/session.ts [app-rsc] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "CUSTOMER_SESSION_COOKIE",
    ()=>CUSTOMER_SESSION_COOKIE,
    "clearCustomerSession",
    ()=>clearCustomerSession,
    "readCustomerSession",
    ()=>readCustomerSession,
    "writeCustomerSession",
    ()=>writeCustomerSession
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/headers.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$auth$2f$session$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/src/lib/auth/session.ts [app-rsc] (ecmascript)");
;
;
;
const CUSTOMER_SESSION_COOKIE = 'dh_customer_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
function cookieOptions(secure) {
    return {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
        maxAge: MAX_AGE_SECONDS
    };
}
function isSecureDeployment() {
    return ("TURBOPACK compile-time value", "development") === 'production';
}
async function readCustomerSession() {
    const raw = (await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cookies"])()).get(CUSTOMER_SESSION_COOKIE)?.value;
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (!parsed?.accessToken || !parsed?.refreshToken || !parsed?.user?.id) return null;
        // A vendor/rider token in this cookie would pass every customer page's guard but fail every API
        // call. Treat it as "not signed in" instead of rendering a shell full of 403s.
        if (parsed.user.role !== 'CUSTOMER') return null;
        return parsed;
    } catch  {
        return null;
    }
}
async function writeCustomerSession(session) {
    (await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cookies"])()).set(CUSTOMER_SESSION_COOKIE, JSON.stringify(session), cookieOptions(isSecureDeployment()));
}
async function clearCustomerSession() {
    (await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cookies"])()).set(CUSTOMER_SESSION_COOKIE, '', {
        ...cookieOptions(isSecureDeployment()),
        maxAge: 0
    });
}
;
}),
"[project]/packages/shared/src/admin-areas.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ADMIN_AREAS",
    ()=>ADMIN_AREAS,
    "SUPER_ADMIN_ONLY_AREAS",
    ()=>SUPER_ADMIN_ONLY_AREAS,
    "adminMayAccess",
    ()=>adminMayAccess
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/shared/src/enums.ts [app-rsc] (ecmascript)");
;
const ADMIN_AREAS = {
    /** Every admin may manage their own account. */ self: [
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AdminRole"].OPERATIONS,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AdminRole"].FINANCE,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AdminRole"].SUPPORT
    ],
    cities: [
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AdminRole"].OPERATIONS
    ],
    vendors: [
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AdminRole"].OPERATIONS
    ],
    delivery: [
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AdminRole"].OPERATIONS
    ],
    promos: [
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AdminRole"].OPERATIONS
    ],
    announcements: [
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AdminRole"].OPERATIONS
    ],
    orders: [
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AdminRole"].OPERATIONS,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AdminRole"].SUPPORT
    ],
    complaints: [
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AdminRole"].OPERATIONS,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AdminRole"].SUPPORT
    ],
    finance: [
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AdminRole"].FINANCE
    ],
    reports: [
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AdminRole"].FINANCE,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AdminRole"].OPERATIONS
    ],
    analytics: [
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AdminRole"].FINANCE,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AdminRole"].OPERATIONS
    ]
};
const SUPER_ADMIN_ONLY_AREAS = [
    'audit',
    'queues',
    'admins'
];
function adminMayAccess(adminRole, area) {
    if (adminRole === __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AdminRole"].SUPER_ADMIN) return true;
    if (!adminRole || !area) return false;
    if (!(area in ADMIN_AREAS)) return false; // super-admin-only area
    return ADMIN_AREAS[area].includes(adminRole);
}
}),
"[project]/packages/shared/src/constants.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/** Values the UI needs that are not worth an API round trip. Keep in step with the API's env defaults. */ /** Pakistan: +92, 10 national digits after the leading 0 is dropped. Matches the API's phone validation. */ __turbopack_context__.s([
    "BUSINESS_TIMEZONE",
    ()=>BUSINESS_TIMEZONE,
    "CURRENCY",
    ()=>CURRENCY,
    "PAGE_SIZE",
    ()=>PAGE_SIZE,
    "PK_PHONE_E164",
    ()=>PK_PHONE_E164,
    "PK_PHONE_LOCAL",
    ()=>PK_PHONE_LOCAL,
    "toE164",
    ()=>toE164,
    "toLocalPhone",
    ()=>toLocalPhone
]);
const PK_PHONE_E164 = /^\+923\d{9}$/;
const PK_PHONE_LOCAL = /^03\d{9}$/;
function toE164(local) {
    const digits = local.replace(/\D/g, '');
    if (digits.startsWith('92')) return `+${digits}`;
    if (digits.startsWith('0')) return `+92${digits.slice(1)}`;
    return `+92${digits}`;
}
function toLocalPhone(e164) {
    return e164.startsWith('+92') ? `0${e164.slice(3)}` : e164;
}
const CURRENCY = 'PKR';
const BUSINESS_TIMEZONE = 'Asia/Karachi';
const PAGE_SIZE = {
    default: 20,
    table: 25,
    compact: 10
};
}),
"[project]/packages/shared/src/enums.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Enums mirrored from apps/api/prisma/schema.prisma.
 *
 * The web app cannot import @prisma/client (server-only, and it would drag the query engine into the
 * bundle), so these are plain const objects with the same members and the same string values.
 *
 * Drift guard: apps/api/src/common/shared-enums.spec.ts reads the Prisma schema and this file and fails
 * if a mirrored enum's members no longer match. Add a member here when you add one in the schema.
 */ __turbopack_context__.s([
    "AdminRole",
    ()=>AdminRole,
    "Availability",
    ()=>Availability,
    "CommissionScope",
    ()=>CommissionScope,
    "ComplaintStatus",
    ()=>ComplaintStatus,
    "ComplaintType",
    ()=>ComplaintType,
    "DiscountType",
    ()=>DiscountType,
    "DocType",
    ()=>DocType,
    "JobStatus",
    ()=>JobStatus,
    "JobType",
    ()=>JobType,
    "LedgerType",
    ()=>LedgerType,
    "Locale",
    ()=>Locale,
    "NotificationChannel",
    ()=>NotificationChannel,
    "OrderStatus",
    ()=>OrderStatus,
    "PaymentMethod",
    ()=>PaymentMethod,
    "PaymentStatus",
    ()=>PaymentStatus,
    "PayoutMethod",
    ()=>PayoutMethod,
    "PayoutStatus",
    ()=>PayoutStatus,
    "ReviewTarget",
    ()=>ReviewTarget,
    "RiderStatus",
    ()=>RiderStatus,
    "Role",
    ()=>Role,
    "ServiceType",
    ()=>ServiceType,
    "TERMINAL_ORDER_STATUSES",
    ()=>TERMINAL_ORDER_STATUSES,
    "UserStatus",
    ()=>UserStatus,
    "VendorStatus",
    ()=>VendorStatus
]);
const Role = {
    CUSTOMER: 'CUSTOMER',
    VENDOR_OWNER: 'VENDOR_OWNER',
    VENDOR_STAFF: 'VENDOR_STAFF',
    RIDER: 'RIDER',
    ADMIN: 'ADMIN'
};
const AdminRole = {
    SUPER_ADMIN: 'SUPER_ADMIN',
    OPERATIONS: 'OPERATIONS',
    FINANCE: 'FINANCE',
    SUPPORT: 'SUPPORT'
};
const UserStatus = {
    ACTIVE: 'ACTIVE',
    SUSPENDED: 'SUSPENDED',
    DEACTIVATED: 'DEACTIVATED'
};
const Locale = {
    EN: 'EN',
    UR: 'UR'
};
const VendorStatus = {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    SUSPENDED: 'SUSPENDED'
};
const Availability = {
    OPEN: 'OPEN',
    CLOSED: 'CLOSED',
    BUSY: 'BUSY'
};
const RiderStatus = {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    SUSPENDED: 'SUSPENDED'
};
const DocType = {
    CNIC_FRONT: 'CNIC_FRONT',
    CNIC_BACK: 'CNIC_BACK',
    SHOP_PHOTO: 'SHOP_PHOTO',
    BUSINESS_REG: 'BUSINESS_REG',
    RIDER_PHOTO: 'RIDER_PHOTO'
};
const ServiceType = {
    WASH_FOLD: 'WASH_FOLD',
    WASH_IRON: 'WASH_IRON',
    DRY_CLEAN: 'DRY_CLEAN',
    IRON_ONLY: 'IRON_ONLY',
    OTHER: 'OTHER'
};
const OrderStatus = {
    PLACED: 'PLACED',
    ACCEPTED: 'ACCEPTED',
    REJECTED: 'REJECTED',
    PICKED_UP: 'PICKED_UP',
    IN_PROCESS: 'IN_PROCESS',
    READY: 'READY',
    OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
    DELIVERED: 'DELIVERED',
    CANCELLED: 'CANCELLED'
};
const TERMINAL_ORDER_STATUSES = [
    OrderStatus.DELIVERED,
    OrderStatus.CANCELLED,
    OrderStatus.REJECTED
];
const PaymentMethod = {
    COD: 'COD',
    CARD: 'CARD',
    JAZZCASH: 'JAZZCASH',
    EASYPAISA: 'EASYPAISA',
    RAAST: 'RAAST'
};
const PaymentStatus = {
    PENDING: 'PENDING',
    PAID: 'PAID',
    FAILED: 'FAILED',
    REFUNDED: 'REFUNDED',
    COD_PENDING: 'COD_PENDING',
    COD_COLLECTED: 'COD_COLLECTED'
};
const JobType = {
    PICKUP: 'PICKUP',
    DROP: 'DROP'
};
const JobStatus = {
    UNASSIGNED: 'UNASSIGNED',
    ASSIGNED: 'ASSIGNED',
    ACCEPTED: 'ACCEPTED',
    IN_TRANSIT: 'IN_TRANSIT',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    CANCELLED: 'CANCELLED'
};
const ReviewTarget = {
    VENDOR: 'VENDOR',
    RIDER: 'RIDER'
};
const ComplaintType = {
    COMPLAINT: 'COMPLAINT',
    REDO: 'REDO'
};
const ComplaintStatus = {
    OPEN: 'OPEN',
    IN_REVIEW: 'IN_REVIEW',
    VENDOR_RESPONDED: 'VENDOR_RESPONDED',
    RESOLVED: 'RESOLVED',
    REJECTED: 'REJECTED'
};
const DiscountType = {
    PERCENT: 'PERCENT',
    FLAT: 'FLAT'
};
const CommissionScope = {
    GLOBAL: 'GLOBAL',
    CATEGORY: 'CATEGORY',
    VENDOR: 'VENDOR'
};
const PayoutMethod = {
    BANK: 'BANK',
    WALLET: 'WALLET'
};
const PayoutStatus = {
    REQUESTED: 'REQUESTED',
    APPROVED: 'APPROVED',
    PAID: 'PAID',
    REJECTED: 'REJECTED'
};
const LedgerType = {
    ORDER_EARNING: 'ORDER_EARNING',
    COMMISSION: 'COMMISSION',
    PAYOUT: 'PAYOUT',
    ADJUSTMENT: 'ADJUSTMENT',
    REFUND: 'REFUND'
};
const NotificationChannel = {
    SMS: 'SMS',
    WHATSAPP: 'WHATSAPP',
    PUSH: 'PUSH',
    EMAIL: 'EMAIL'
};
}),
"[project]/packages/shared/src/error-codes.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Error handling contract with the API.
 *
 * The API answers every failure with `{ error: { code, message, details?, requestId } }`
 * (apps/api/src/common/filters/all-exceptions.filter.ts) and there are well over a hundred domain codes,
 * each already carrying a readable English message written by the backend.
 *
 * So the panel does NOT keep a message per code — that table would be stale within a week. It shows the
 * server's own message and keeps only the codes where the UI has to *behave* differently.
 */ /** The envelope the API sends on failure. */ __turbopack_context__.s([
    "ACCOUNT_ERROR_CODES",
    ()=>ACCOUNT_ERROR_CODES,
    "ADMIN_MESSAGE_OVERRIDES",
    ()=>ADMIN_MESSAGE_OVERRIDES,
    "RETRYABLE_ERROR_CODES",
    ()=>RETRYABLE_ERROR_CODES,
    "SESSION_ERROR_CODES",
    ()=>SESSION_ERROR_CODES,
    "adminErrorMessage",
    ()=>adminErrorMessage,
    "isAccountErrorCode",
    ()=>isAccountErrorCode,
    "isRetryableErrorCode",
    ()=>isRetryableErrorCode,
    "isSessionErrorCode",
    ()=>isSessionErrorCode,
    "validationDetails",
    ()=>validationDetails,
    "validationSummary",
    ()=>validationSummary
]);
const RETRYABLE_ERROR_CODES = [
    'SERVICE_BUSY',
    'RATE_LIMITED'
];
const SESSION_ERROR_CODES = [
    'UNAUTHENTICATED',
    'CSRF_ORIGIN'
];
const ACCOUNT_ERROR_CODES = [
    'ACCOUNT_SUSPENDED',
    'ACCOUNT_LOCKED'
];
const ADMIN_MESSAGE_OVERRIDES = {
    SERVICE_BUSY: 'The system is busy. This will retry automatically — nothing was saved twice.',
    RATE_LIMITED: 'Too many requests. Wait a moment and try again.',
    UNAUTHENTICATED: 'Your session expired. Please sign in again.',
    CSRF_ORIGIN: 'That request did not come from the admin panel. Please sign in again.',
    INTERNAL_ERROR: 'Something broke on our side. The request ID below will let us trace it.',
    VALIDATION_FAILED: 'Some fields need fixing.',
    // Money and state races: staff need to know their view was stale, not that they did something wrong.
    ORDER_STATE_CHANGED: 'This order changed while you were looking at it. Reload to see its current state.',
    AUDIENCE_CHANGED: 'The audience changed since the preview. Preview again before sending.',
    PROMO_CHANGED: 'This promo changed while you were editing it. Reload and reapply your change.',
    PAYOUT_INVALID_STATE: 'This payout is no longer in a state where that action applies. Reload the queue.',
    LAST_SUPER_ADMIN: 'You cannot remove the last active super admin. Promote another admin first.',
    CANNOT_CHANGE_SELF: 'You cannot change your own role or status.'
};
function isRetryableErrorCode(code) {
    return !!code && RETRYABLE_ERROR_CODES.includes(code);
}
function isSessionErrorCode(code) {
    return !!code && SESSION_ERROR_CODES.includes(code);
}
function isAccountErrorCode(code) {
    return !!code && ACCOUNT_ERROR_CODES.includes(code);
}
function adminErrorMessage(code, serverMessage) {
    if (code && ADMIN_MESSAGE_OVERRIDES[code]) return ADMIN_MESSAGE_OVERRIDES[code];
    return serverMessage?.trim() || 'Something went wrong.';
}
function validationDetails(details) {
    if (typeof details === 'string') return [
        {
            field: '',
            messages: [
                details
            ]
        }
    ];
    if (!Array.isArray(details)) return [];
    const out = [];
    for (const entry of details){
        if (typeof entry === 'string') {
            out.push({
                field: '',
                messages: [
                    entry
                ]
            });
            continue;
        }
        if (entry && typeof entry === 'object' && 'field' in entry) {
            const e = entry;
            const messages = Array.isArray(e.messages) ? e.messages.filter((m)=>typeof m === 'string') : [];
            if (typeof e.field === 'string' && messages.length) out.push({
                field: e.field,
                messages
            });
        }
    }
    return out;
}
function validationSummary(details) {
    const fields = validationDetails(details);
    if (!fields.length) return '';
    return fields.map((f)=>f.field ? `${f.field}: ${f.messages.join(', ')}` : f.messages.join(', ')).join(' · ');
}
}),
"[project]/packages/shared/src/index.ts [app-rsc] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$admin$2d$areas$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/shared/src/admin-areas.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$money$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/shared/src/money.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$schemas$2f$admin$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/shared/src/schemas/admin.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$schemas$2f$vendor$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/shared/src/schemas/vendor.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$schemas$2f$customer$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/shared/src/schemas/customer.ts [app-rsc] (ecmascript)");
;
;
;
;
;
;
;
;
}),
"[project]/packages/shared/src/money.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "compareMoney",
    ()=>compareMoney,
    "formatCount",
    ()=>formatCount,
    "formatFractionAsPercent",
    ()=>formatFractionAsPercent,
    "formatMoney",
    ()=>formatMoney,
    "formatMoneyCompact",
    ()=>formatMoneyCompact,
    "formatRatePct",
    ()=>formatRatePct,
    "fromPaisa",
    ()=>fromPaisa,
    "isZeroMoney",
    ()=>isZeroMoney,
    "subtractMoney",
    ()=>subtractMoney,
    "sumMoney",
    ()=>sumMoney,
    "toPaisa",
    ()=>toPaisa
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$constants$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/shared/src/constants.ts [app-rsc] (ecmascript)");
;
function toPaisa(amount) {
    if (amount === null || amount === undefined || amount === '') return 0;
    const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
    if (!match) throw new Error(`Not a money string: ${JSON.stringify(amount)}`);
    const [, sign, whole, frac = '0'] = match;
    const paisa = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
    return sign === '-' ? -paisa : paisa;
}
function fromPaisa(paisa) {
    const sign = paisa < 0 ? '-' : '';
    const abs = Math.abs(Math.round(paisa));
    return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
function sumMoney(amounts) {
    return fromPaisa(amounts.reduce((acc, a)=>acc + toPaisa(a), 0));
}
function subtractMoney(a, b) {
    return fromPaisa(toPaisa(a) - toPaisa(b));
}
function compareMoney(a, b) {
    return toPaisa(a) - toPaisa(b);
}
function isZeroMoney(a) {
    return toPaisa(a) === 0;
}
function formatMoney(amount, opts) {
    if (amount === null || amount === undefined || amount === '') return '—';
    const decimals = opts?.decimals ?? true;
    return new Intl.NumberFormat('en-PK', {
        style: 'currency',
        currency: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$constants$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["CURRENCY"],
        minimumFractionDigits: decimals ? 2 : 0,
        maximumFractionDigits: decimals ? 2 : 0
    }).format(toPaisa(amount) / 100);
}
function formatMoneyCompact(amount) {
    if (amount === null || amount === undefined || amount === '') return '—';
    return new Intl.NumberFormat('en-PK', {
        style: 'currency',
        currency: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$constants$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["CURRENCY"],
        notation: 'compact',
        maximumFractionDigits: 1
    }).format(toPaisa(amount) / 100);
}
function formatCount(n) {
    if (n === null || n === undefined) return '—';
    return new Intl.NumberFormat('en-PK').format(n);
}
function formatRatePct(rate, digits = 2) {
    if (rate === null || rate === undefined || rate === '') return '—';
    const n = typeof rate === 'number' ? rate : Number(rate);
    if (!Number.isFinite(n)) return '—';
    return `${n.toFixed(digits).replace(/\.?0+$/, '')}%`;
}
function formatFractionAsPercent(fraction, digits = 1) {
    if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return '—';
    return `${(fraction * 100).toFixed(digits)}%`;
}
}),
"[project]/packages/shared/src/schemas/admin.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ANNOUNCE_CHANNELS",
    ()=>ANNOUNCE_CHANNELS,
    "COMPLAINT_OUTCOMES",
    ()=>COMPLAINT_OUTCOMES,
    "PAYOUT_METHODS",
    ()=>PAYOUT_METHODS,
    "REPORT_FORMATS",
    ()=>REPORT_FORMATS,
    "REPORT_TYPES",
    ()=>REPORT_TYPES,
    "TARGET_ROLES",
    ()=>TARGET_ROLES,
    "changePasswordSchema",
    ()=>changePasswordSchema,
    "createAdminSchema",
    ()=>createAdminSchema,
    "createAnnouncementSchema",
    ()=>createAnnouncementSchema,
    "createCommissionRuleSchema",
    ()=>createCommissionRuleSchema,
    "createPromoSchema",
    ()=>createPromoSchema,
    "createReportSchema",
    ()=>createReportSchema,
    "payPayoutSchema",
    ()=>payPayoutSchema,
    "reasonSchema",
    ()=>reasonSchema,
    "rejectPayoutSchema",
    ()=>rejectPayoutSchema,
    "resolveComplaintSchema",
    ()=>resolveComplaintSchema,
    "segmentSchema",
    ()=>segmentSchema,
    "settleCodSchema",
    ()=>settleCodSchema,
    "updateAdminSchema",
    ()=>updateAdminSchema,
    "updateCitySchema",
    ()=>updateCitySchema,
    "updateCommissionRuleSchema",
    ()=>updateCommissionRuleSchema,
    "updatePromoSchema",
    ()=>updatePromoSchema
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-rsc] (ecmascript) <export * as z .string>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-rsc] (ecmascript) <export * as z .object>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-rsc] (ecmascript) <export * as z .literal>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-rsc] (ecmascript) <export * as z .enum>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-rsc] (ecmascript) <export * as z .coerce>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-rsc] (ecmascript) <export * as z .boolean>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-rsc] (ecmascript) <export * as z .array>");
/*
 * Each schema exports two types.
 *
 *   XInput  — what the form holds while it is being filled in. Anything behind `z.coerce` is `unknown`
 *             here, because a number field really does start life as a string in the DOM.
 *   X       — what the schema produces once it parses, which is what goes on the wire.
 *
 * react-hook-form needs both: `useForm<XInput, unknown, X>`. Passing only the output type makes the
 * resolver's generics disagree with the field registrations and the errors are unreadable.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/shared/src/enums.ts [app-rsc] (ecmascript)");
;
;
/**
 * Form schemas for the admin panel, mirroring the API's class-validator DTOs field for field.
 *
 * Why mirror rather than trust the server: the API already validates everything and its errors come back
 * per field, but a round trip to learn "that code needs 3 characters" is a poor experience on a 3G
 * connection. These catch it in the browser; the server is still the authority.
 *
 * Each schema notes the DTO it mirrors. If one drifts, the server rejects the request and the panel shows
 * the server's field errors, so drift degrades to "slower", never to "wrong data accepted".
 */ /** The API's money format: a plain decimal with at most 2 places, matching its MONEY regex. */ const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
const money = (label)=>__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().regex(MONEY, {
        message: `${label} must look like 150 or 150.00`
    });
const isoDate = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Use a date like 2026-10-24'
});
const reasonSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    reason: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().min(5, {
        message: 'Give a reason of at least 5 characters — the vendor sees this.'
    }).max(500)
});
const rejectPayoutSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    reason: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().min(3, {
        message: 'Give a short reason.'
    }).max(300)
});
const payPayoutSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    txnRef: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().min(3, {
        message: 'Enter the bank or wallet transaction reference.'
    }).max(100)
});
const settleCodSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    riderId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().uuid(),
    reference: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().max(100).optional().or(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal(''))
});
const createCommissionRuleSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    scope: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["CommissionScope"].GLOBAL,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["CommissionScope"].CATEGORY,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["CommissionScope"].VENDOR
    ]),
    vendorId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().uuid().optional(),
    categoryId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().int().min(1).optional(),
    ratePct: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().min(0, {
        message: 'Rate cannot be negative.'
    }).max(100, {
        message: 'Rate cannot exceed 100%.'
    }).refine((n)=>Number.isInteger(n * 100), {
        message: 'At most 2 decimal places.'
    }),
    effectiveFrom: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional()
})// The API resolves a rate as vendor rule, else category rule, else global, so the scope decides which
// target field is required. Getting this wrong server-side returns a bare VALIDATION_FAILED.
.refine((v)=>v.scope !== __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["CommissionScope"].VENDOR || !!v.vendorId, {
    message: 'Choose a vendor for a vendor-scoped rule.',
    path: [
        'vendorId'
    ]
}).refine((v)=>v.scope !== __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["CommissionScope"].CATEGORY || !!v.categoryId, {
    message: 'Choose a service category for a category-scoped rule.',
    path: [
        'categoryId'
    ]
});
const updateCommissionRuleSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    ratePct: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().min(0).max(100).refine((n)=>Number.isInteger(n * 100), {
        message: 'At most 2 decimal places.'
    }).optional(),
    effectiveFrom: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional()
});
const createPromoSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    code: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,32}$/, {
        message: 'Use 3–32 letters, numbers, _ or -.'
    }),
    discountType: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["DiscountType"].PERCENT,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["DiscountType"].FLAT
    ]),
    value: money('Value'),
    maxDiscount: money('Cap').optional().or(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal('')),
    minOrderAmount: money('Minimum order').optional().or(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal('')),
    maxUses: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().int().min(1).max(1_000_000).optional(),
    perUserLimit: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().int().min(1).max(100).optional(),
    validFrom: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(1, {
        message: 'Choose a start date.'
    }),
    validTo: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(1, {
        message: 'Choose an end date.'
    }),
    cityId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().int().min(1).optional(),
    isActive: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean().optional()
}).refine((v)=>new Date(v.validTo) > new Date(v.validFrom), {
    message: 'The end date must be after the start date.',
    path: [
        'validTo'
    ]
})// A percentage over 100 is accepted by the MONEY regex but makes no sense as a discount.
.refine((v)=>v.discountType !== __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["DiscountType"].PERCENT || Number(v.value) <= 100, {
    message: 'A percentage discount cannot exceed 100.',
    path: [
        'value'
    ]
}).refine((v)=>v.discountType !== __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["DiscountType"].PERCENT || Number(v.value) > 0, {
    message: 'A percentage discount must be more than 0.',
    path: [
        'value'
    ]
});
const updatePromoSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    value: money('Value').optional().or(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal('')),
    maxDiscount: money('Cap').optional().or(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal('')),
    minOrderAmount: money('Minimum order').optional().or(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal('')),
    maxUses: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().int().min(1).max(1_000_000).optional(),
    perUserLimit: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().int().min(1).max(100).optional(),
    validFrom: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional(),
    validTo: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional(),
    cityId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().int().min(1).optional(),
    isActive: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean().optional()
});
const TARGET_ROLES = [
    __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Role"].CUSTOMER,
    __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Role"].VENDOR_OWNER,
    __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Role"].VENDOR_STAFF,
    __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Role"].RIDER
];
const ANNOUNCE_CHANNELS = [
    __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["NotificationChannel"].PUSH,
    __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["NotificationChannel"].SMS,
    __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["NotificationChannel"].EMAIL
];
const segmentSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    roles: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum(TARGET_ROLES)).max(TARGET_ROLES.length).optional(),
    cityId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().int().min(1).optional(),
    activeWithinDays: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().int().min(1).max(365).optional(),
    inactiveForDays: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().int().min(1).max(730).optional()
})// Both at once describes an empty audience, which the API would accept and send to nobody.
.refine((v)=>!(v.activeWithinDays && v.inactiveForDays), {
    message: 'Choose either recently active or inactive, not both.',
    path: [
        'inactiveForDays'
    ]
});
const createAnnouncementSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    title: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().min(1, {
        message: 'Add a title.'
    }).max(65),
    body: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().min(1, {
        message: 'Add a message.'
    }).max(500),
    titleUr: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().max(65).optional().or(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal('')),
    bodyUr: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().max(500).optional().or(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal('')),
    segment: segmentSchema,
    channels: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum(ANNOUNCE_CHANNELS)).min(1, {
        message: 'Choose at least one channel.'
    }),
    confirmRecipients: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().int().min(0)
})// The DTO comment says "both or neither": a title without a body would send a half-translated push.
.refine((v)=>!!v.titleUr === !!v.bodyUr, {
    message: 'Provide both the Urdu title and the Urdu message, or neither.',
    path: [
        'bodyUr'
    ]
});
const REPORT_TYPES = [
    'ORDERS',
    'PAYMENTS',
    'PAYOUTS',
    'COD',
    'VENDORS'
];
const REPORT_FORMATS = [
    'CSV',
    'XLSX'
];
const createReportSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    type: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum(REPORT_TYPES),
    format: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum(REPORT_FORMATS).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    cityId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().int().min(1).optional(),
    vendorId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().uuid().optional()
}).refine((v)=>!v.from || !v.to || v.from <= v.to, {
    message: 'The start date must not be after the end date.',
    path: [
        'to'
    ]
});
const COMPLAINT_OUTCOMES = [
    'REFUND',
    'REDO',
    'REJECT'
];
const resolveComplaintSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    outcome: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum(COMPLAINT_OUTCOMES),
    note: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().min(3).max(1000).optional().or(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal(''))
})// Rejecting a customer's complaint without saying why is the kind of thing that ends up in a screenshot.
.refine((v)=>v.outcome !== 'REJECT' || v.note && v.note.trim().length >= 3, {
    message: 'Explain why the complaint is being rejected.',
    path: [
        'note'
    ]
});
const createAdminSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    email: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().toLowerCase().email({
        message: 'Enter a valid email address.'
    }).max(254),
    name: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().min(2, {
        message: 'Enter a name.'
    }).max(100),
    password: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(12, {
        message: 'Use at least 12 characters.'
    }).max(200),
    adminRole: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AdminRole"].SUPER_ADMIN,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AdminRole"].OPERATIONS,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AdminRole"].FINANCE,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AdminRole"].SUPPORT
    ])
});
const updateAdminSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    adminRole: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AdminRole"].SUPER_ADMIN,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AdminRole"].OPERATIONS,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AdminRole"].FINANCE,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AdminRole"].SUPPORT
    ]).optional(),
    status: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
        'ACTIVE',
        'DEACTIVATED'
    ]).optional()
});
const changePasswordSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    currentPassword: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(1, {
        message: 'Enter your current password.'
    }).max(200),
    newPassword: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(12, {
        message: 'Use at least 12 characters.'
    }).max(200),
    confirmPassword: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(1)
}).refine((v)=>v.newPassword === v.confirmPassword, {
    message: 'The two passwords do not match.',
    path: [
        'confirmPassword'
    ]
}).refine((v)=>v.newPassword !== v.currentPassword, {
    message: 'Choose a password different from the current one.',
    path: [
        'newPassword'
    ]
});
const updateCitySchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    deliveryFee: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().min(0).max(5000, {
        message: 'The delivery fee cannot exceed Rs 5,000.'
    }).refine((n)=>Number.isInteger(n * 100), {
        message: 'At most 2 decimal places.'
    }).optional(),
    isActive: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean().optional(),
    code: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().toUpperCase().regex(/^[A-Z]{2,4}$/, {
        message: 'Use 2–4 letters, e.g. LHR.'
    }).optional(),
    nameUr: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().min(1).max(80).optional().or(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal('')),
    // null puts the city back on our own riders; a UUID hands it to a courier partner.
    courierPartnerId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().uuid().nullable().optional()
});
const PAYOUT_METHODS = [
    __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["PayoutMethod"].BANK,
    __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["PayoutMethod"].WALLET
];
}),
"[project]/packages/shared/src/schemas/customer.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "cartItemSchema",
    ()=>cartItemSchema,
    "cartSchema",
    ()=>cartSchema,
    "checkoutDraftSchema",
    ()=>checkoutDraftSchema,
    "discoveryFiltersSchema",
    ()=>discoveryFiltersSchema,
    "slotSchema",
    ()=>slotSchema
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-rsc] (ecmascript) <export * as z .object>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-rsc] (ecmascript) <export * as z .string>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-rsc] (ecmascript) <export * as z .number>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-rsc] (ecmascript) <export * as z .enum>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-rsc] (ecmascript) <export * as z .array>");
;
const discoveryFiltersSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    serviceType: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional(),
    minRating: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().min(1).max(5).optional(),
    maxPrice: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().min(0).optional(),
    sortBy: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
        'distance',
        'rating',
        'price'
    ]).default('distance')
});
const cartItemSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    itemId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    quantity: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().min(1)
});
const cartSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    vendorId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    items: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(cartItemSchema)
});
const slotSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    date: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    startTime: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    endTime: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string()
});
const checkoutDraftSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    cart: cartSchema,
    address: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
        id: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string()
    }),
    pickupSlot: slotSchema,
    deliverySlot: slotSchema,
    paymentMethod: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
        'COD'
    ]),
    notes: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().max(200).optional(),
    idempotencyKey: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional()
});
}),
"[project]/packages/shared/src/schemas/vendor.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "catalogItemSchema",
    ()=>catalogItemSchema,
    "payoutRequestSchema",
    ()=>payoutRequestSchema,
    "vendorProfileSchema",
    ()=>vendorProfileSchema,
    "vendorRegistrationSchema",
    ()=>vendorRegistrationSchema
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-rsc] (ecmascript) <export * as z .object>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-rsc] (ecmascript) <export * as z .string>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-rsc] (ecmascript) <export * as z .enum>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-rsc] (ecmascript) <export * as z .number>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-rsc] (ecmascript) <export * as z .array>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-rsc] (ecmascript) <export * as z .boolean>");
;
const vendorRegistrationSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    businessName: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(3, 'Business name must be at least 3 characters'),
    businessType: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
        'LAUNDRY',
        'DRY_CLEANER'
    ]),
    shopPhoneNumber: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().regex(/^03\d{9}$/, 'Invalid phone number'),
    shopAddress: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
        address: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(5, 'Address required'),
        lat: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
        lng: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
        city: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string()
    }),
    serviceRadiusKm: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().min(1).max(50),
    ownerName: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(3),
    ownerPhone: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().regex(/^03\d{9}$/),
    cnicNumber: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().length(13, 'CNIC must be 13 digits'),
    cnicPhotoUrl: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().url(),
    shopPhotoUrls: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().url()).min(1, 'At least one shop photo required')
});
const vendorProfileSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    name: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(2),
    locale: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
        'EN',
        'UR'
    ])
});
const catalogItemSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    name: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(1),
    nameUr: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(1),
    category: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    price: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().min(0),
    turnaroundHours: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().min(1),
    active: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean().default(true)
});
const payoutRequestSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    bankIban: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().regex(/^PK\d{2}[A-Z]{4}\d{21}$/),
    amount: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().min(1000),
    notes: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().max(255).optional()
});
}),
];})()

//# sourceMappingURL=_13o5zrx00idos._.js.map