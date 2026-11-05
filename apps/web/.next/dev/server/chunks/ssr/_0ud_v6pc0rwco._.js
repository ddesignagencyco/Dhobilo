(()=>{"use strict";module.exports = [
"[project]/apps/web/src/components/providers/query-provider.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "QueryProvider",
    ()=>QueryProvider
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$query$2d$core$2f$build$2f$modern$2f$queryCache$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@tanstack/query-core/build/modern/queryCache.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$query$2d$core$2f$build$2f$modern$2f$queryClient$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@tanstack/query-core/build/modern/queryClient.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$QueryClientProvider$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/sonner/dist/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$index$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/shared/src/index.ts [app-ssr] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$error$2d$codes$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/shared/src/error-codes.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2f$bff$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/src/lib/api/bff.ts [app-ssr] (ecmascript)");
'use client';
;
;
;
;
;
;
/**
 * Query defaults for an operations panel.
 *
 * Admin data is live data: a stale payout queue or dispatch board gets someone paid twice or a rider sent
 * to a job already done. So nothing is cached for long, and anything the admin is actually looking at
 * refetches when they come back to the tab.
 */ function makeQueryClient() {
    return new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$query$2d$core$2f$build$2f$modern$2f$queryClient$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["QueryClient"]({
        queryCache: new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$query$2d$core$2f$build$2f$modern$2f$queryCache$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["QueryCache"]({
            onError: (error, query)=>{
                // Only shout about a background refetch failure if we already have data on screen; the first
                // load renders its own error state, and two messages for one failure is noise.
                if (query.state.data === undefined) return;
                if (error instanceof __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2f$bff$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["BffError"] && error.isSessionExpired) return; // handled by the redirect below
                __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["toast"].error(error instanceof Error ? error.message : 'Could not refresh this view.');
            }
        }),
        defaultOptions: {
            queries: {
                staleTime: 15_000,
                gcTime: 5 * 60_000,
                refetchOnWindowFocus: true,
                retry: (failureCount, error)=>{
                    if (failureCount >= 2) return false;
                    if (error instanceof __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$lib$2f$api$2f$bff$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["BffError"]) {
                        // Never retry a 4xx the admin caused, and never retry past an expired session.
                        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$error$2d$codes$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isRetryableErrorCode"])(error.code);
                    }
                    return true; // network blip
                },
                retryDelay: (attempt)=>Math.min(500 * 2 ** attempt, 4_000)
            },
            mutations: {
                // A mutation is a deliberate act by a person: never retry it behind their back.
                retry: false
            }
        }
    });
}
let browserQueryClient;
function getQueryClient() {
    if ("TURBOPACK compile-time truthy", 1) return makeQueryClient();
    //TURBOPACK unreachable
    ;
}
function QueryProvider({ children }) {
    const [queryClient] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(getQueryClient);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$QueryClientProvider$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["QueryClientProvider"], {
        client: queryClient,
        children: children
    }, void 0, false, {
        fileName: "[project]/apps/web/src/components/providers/query-provider.tsx",
        lineNumber: 60,
        columnNumber: 10
    }, this);
}
}),
"[project]/apps/web/src/components/ui/sonner.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Toaster",
    ()=>Toaster
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/sonner/dist/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$use$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/use-intl/dist/esm/development/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$i18n$2f$routing$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/src/i18n/routing.ts [app-ssr] (ecmascript)");
'use client';
;
;
;
;
/** Toasts sit opposite the sidebar, and flip side in Urdu so they never cover the navigation. */ const Toaster = (props)=>{
    const locale = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$use$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useLocale"])();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Toaster"], {
        dir: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$i18n$2f$routing$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isRtl"])(locale) ? 'rtl' : 'ltr',
        position: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$src$2f$i18n$2f$routing$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isRtl"])(locale) ? 'bottom-left' : 'bottom-right',
        closeButton: true,
        richColors: true,
        toastOptions: {
            classNames: {
                toast: 'group toast bg-popover text-popover-foreground border-border shadow-lg',
                description: 'text-muted-foreground'
            }
        },
        ...props
    }, void 0, false, {
        fileName: "[project]/apps/web/src/components/ui/sonner.tsx",
        lineNumber: 11,
        columnNumber: 5
    }, ("TURBOPACK compile-time value", void 0));
};
;
}),
"[project]/apps/web/src/i18n/routing.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
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
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$routing$2f$defineRouting$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__defineRouting$3e$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/routing/defineRouting.js [app-ssr] (ecmascript) <export default as defineRouting>");
;
const routing = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$routing$2f$defineRouting$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__defineRouting$3e$__["defineRouting"])({
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
"[project]/apps/web/src/lib/api/bff.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "BffError",
    ()=>BffError,
    "bff",
    ()=>bff,
    "bffData",
    ()=>bffData,
    "customerBff",
    ()=>customerBff,
    "customerBffData",
    ()=>customerBffData
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$index$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/shared/src/index.ts [app-ssr] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$error$2d$codes$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/shared/src/error-codes.ts [app-ssr] (ecmascript)");
;
class BffError extends Error {
    status;
    code;
    details;
    requestId;
    constructor(status, body, fallback){
        const code = body?.code ?? 'INTERNAL_ERROR';
        super((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$error$2d$codes$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["adminErrorMessage"])(code, body?.message ?? fallback));
        this.name = 'BffError';
        this.status = status;
        this.code = code;
        this.details = body?.details;
        this.requestId = body?.requestId;
    }
    get isSessionExpired() {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$error$2d$codes$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isSessionErrorCode"])(this.code) || this.status === 401;
    }
    get isForbidden() {
        return this.code === 'FORBIDDEN' || this.status === 403;
    }
    get fieldErrors() {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$error$2d$codes$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["validationDetails"])(this.details);
    }
}
function bffUrl(base, path, query) {
    const clean = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${base}${clean}`, window.location.origin);
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
/**
 * On an expired session the whole page is reloaded rather than redirected in the router: middleware then
 * does the redirect with a `next` parameter, so the admin lands back where they were after signing in.
 */ function handleSessionExpiry() {
    window.location.reload();
    // `reload()` does not return, but TypeScript cannot know that.
    throw new BffError(401, {
        code: 'UNAUTHENTICATED',
        message: 'Your session expired.'
    });
}
async function bff(path, options = {}) {
    return bffAt('/api/bff', path, options);
}
async function bffAt(base, path, options = {}) {
    const { method = 'GET', query, body, signal, headers = {} } = options;
    const response = await fetch(bffUrl(base, path, query), {
        method,
        headers: {
            Accept: 'application/json',
            ...body !== undefined ? {
                'Content-Type': 'application/json'
            } : {},
            ...headers
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
        credentials: 'same-origin'
    });
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
    if (!response.ok) {
        const errorBody = parsed?.error;
        const error = new BffError(response.status, errorBody, response.statusText);
        if (error.isSessionExpired) handleSessionExpiry();
        throw error;
    }
    const envelope = parsed;
    const hasEnvelope = !!envelope && typeof envelope === 'object' && 'data' in envelope;
    return {
        data: hasEnvelope ? envelope.data : parsed,
        meta: hasEnvelope ? envelope.meta : undefined
    };
}
async function bffData(path, options = {}) {
    return (await bff(path, options)).data;
}
async function customerBff(path, options = {}) {
    return bffAt('/api/customer/bff', path, options);
}
async function customerBffData(path, options = {}) {
    return (await customerBff(path, options)).data;
}
}),
"[project]/packages/shared/src/admin-areas.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ADMIN_AREAS",
    ()=>ADMIN_AREAS,
    "SUPER_ADMIN_ONLY_AREAS",
    ()=>SUPER_ADMIN_ONLY_AREAS,
    "adminMayAccess",
    ()=>adminMayAccess
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/shared/src/enums.ts [app-ssr] (ecmascript)");
;
const ADMIN_AREAS = {
    /** Every admin may manage their own account. */ self: [
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminRole"].OPERATIONS,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminRole"].FINANCE,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminRole"].SUPPORT
    ],
    cities: [
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminRole"].OPERATIONS
    ],
    vendors: [
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminRole"].OPERATIONS
    ],
    delivery: [
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminRole"].OPERATIONS
    ],
    promos: [
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminRole"].OPERATIONS
    ],
    announcements: [
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminRole"].OPERATIONS
    ],
    orders: [
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminRole"].OPERATIONS,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminRole"].SUPPORT
    ],
    complaints: [
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminRole"].OPERATIONS,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminRole"].SUPPORT
    ],
    finance: [
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminRole"].FINANCE
    ],
    reports: [
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminRole"].FINANCE,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminRole"].OPERATIONS
    ],
    analytics: [
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminRole"].FINANCE,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminRole"].OPERATIONS
    ]
};
const SUPER_ADMIN_ONLY_AREAS = [
    'audit',
    'queues',
    'admins'
];
function adminMayAccess(adminRole, area) {
    if (adminRole === __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminRole"].SUPER_ADMIN) return true;
    if (!adminRole || !area) return false;
    if (!(area in ADMIN_AREAS)) return false; // super-admin-only area
    return ADMIN_AREAS[area].includes(adminRole);
}
}),
"[project]/packages/shared/src/constants.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/packages/shared/src/enums.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/packages/shared/src/error-codes.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/packages/shared/src/index.ts [app-ssr] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$admin$2d$areas$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/shared/src/admin-areas.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$money$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/shared/src/money.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$schemas$2f$admin$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/shared/src/schemas/admin.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$schemas$2f$vendor$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/shared/src/schemas/vendor.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$schemas$2f$customer$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/shared/src/schemas/customer.ts [app-ssr] (ecmascript)");
;
;
;
;
;
;
;
;
}),
"[project]/packages/shared/src/money.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
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
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/shared/src/constants.ts [app-ssr] (ecmascript)");
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
        currency: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CURRENCY"],
        minimumFractionDigits: decimals ? 2 : 0,
        maximumFractionDigits: decimals ? 2 : 0
    }).format(toPaisa(amount) / 100);
}
function formatMoneyCompact(amount) {
    if (amount === null || amount === undefined || amount === '') return '—';
    return new Intl.NumberFormat('en-PK', {
        style: 'currency',
        currency: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CURRENCY"],
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
"[project]/packages/shared/src/schemas/admin.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
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
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-ssr] (ecmascript) <export * as z .string>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-ssr] (ecmascript) <export * as z .object>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-ssr] (ecmascript) <export * as z .literal>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-ssr] (ecmascript) <export * as z .enum>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-ssr] (ecmascript) <export * as z .coerce>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-ssr] (ecmascript) <export * as z .boolean>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-ssr] (ecmascript) <export * as z .array>");
/*
 * Each schema exports two types.
 *
 *   XInput  — what the form holds while it is being filled in. Anything behind `z.coerce` is `unknown`
 *             here, because a number field really does start life as a string in the DOM.
 *   X       — what the schema produces once it parses, which is what goes on the wire.
 *
 * react-hook-form needs both: `useForm<XInput, unknown, X>`. Passing only the output type makes the
 * resolver's generics disagree with the field registrations and the errors are unreadable.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/shared/src/enums.ts [app-ssr] (ecmascript)");
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
const money = (label)=>__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().regex(MONEY, {
        message: `${label} must look like 150 or 150.00`
    });
const isoDate = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Use a date like 2026-10-24'
});
const reasonSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    reason: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().min(5, {
        message: 'Give a reason of at least 5 characters — the vendor sees this.'
    }).max(500)
});
const rejectPayoutSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    reason: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().min(3, {
        message: 'Give a short reason.'
    }).max(300)
});
const payPayoutSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    txnRef: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().min(3, {
        message: 'Enter the bank or wallet transaction reference.'
    }).max(100)
});
const settleCodSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    riderId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().uuid(),
    reference: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().max(100).optional().or(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal(''))
});
const createCommissionRuleSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    scope: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CommissionScope"].GLOBAL,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CommissionScope"].CATEGORY,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CommissionScope"].VENDOR
    ]),
    vendorId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().uuid().optional(),
    categoryId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().int().min(1).optional(),
    ratePct: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().min(0, {
        message: 'Rate cannot be negative.'
    }).max(100, {
        message: 'Rate cannot exceed 100%.'
    }).refine((n)=>Number.isInteger(n * 100), {
        message: 'At most 2 decimal places.'
    }),
    effectiveFrom: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional()
})// The API resolves a rate as vendor rule, else category rule, else global, so the scope decides which
// target field is required. Getting this wrong server-side returns a bare VALIDATION_FAILED.
.refine((v)=>v.scope !== __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CommissionScope"].VENDOR || !!v.vendorId, {
    message: 'Choose a vendor for a vendor-scoped rule.',
    path: [
        'vendorId'
    ]
}).refine((v)=>v.scope !== __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CommissionScope"].CATEGORY || !!v.categoryId, {
    message: 'Choose a service category for a category-scoped rule.',
    path: [
        'categoryId'
    ]
});
const updateCommissionRuleSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    ratePct: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().min(0).max(100).refine((n)=>Number.isInteger(n * 100), {
        message: 'At most 2 decimal places.'
    }).optional(),
    effectiveFrom: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional()
});
const createPromoSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    code: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,32}$/, {
        message: 'Use 3–32 letters, numbers, _ or -.'
    }),
    discountType: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DiscountType"].PERCENT,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DiscountType"].FLAT
    ]),
    value: money('Value'),
    maxDiscount: money('Cap').optional().or(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal('')),
    minOrderAmount: money('Minimum order').optional().or(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal('')),
    maxUses: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().int().min(1).max(1_000_000).optional(),
    perUserLimit: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().int().min(1).max(100).optional(),
    validFrom: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(1, {
        message: 'Choose a start date.'
    }),
    validTo: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(1, {
        message: 'Choose an end date.'
    }),
    cityId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().int().min(1).optional(),
    isActive: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean().optional()
}).refine((v)=>new Date(v.validTo) > new Date(v.validFrom), {
    message: 'The end date must be after the start date.',
    path: [
        'validTo'
    ]
})// A percentage over 100 is accepted by the MONEY regex but makes no sense as a discount.
.refine((v)=>v.discountType !== __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DiscountType"].PERCENT || Number(v.value) <= 100, {
    message: 'A percentage discount cannot exceed 100.',
    path: [
        'value'
    ]
}).refine((v)=>v.discountType !== __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DiscountType"].PERCENT || Number(v.value) > 0, {
    message: 'A percentage discount must be more than 0.',
    path: [
        'value'
    ]
});
const updatePromoSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    value: money('Value').optional().or(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal('')),
    maxDiscount: money('Cap').optional().or(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal('')),
    minOrderAmount: money('Minimum order').optional().or(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal('')),
    maxUses: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().int().min(1).max(1_000_000).optional(),
    perUserLimit: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().int().min(1).max(100).optional(),
    validFrom: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional(),
    validTo: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional(),
    cityId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().int().min(1).optional(),
    isActive: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean().optional()
});
const TARGET_ROLES = [
    __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Role"].CUSTOMER,
    __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Role"].VENDOR_OWNER,
    __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Role"].VENDOR_STAFF,
    __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Role"].RIDER
];
const ANNOUNCE_CHANNELS = [
    __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["NotificationChannel"].PUSH,
    __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["NotificationChannel"].SMS,
    __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["NotificationChannel"].EMAIL
];
const segmentSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    roles: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum(TARGET_ROLES)).max(TARGET_ROLES.length).optional(),
    cityId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().int().min(1).optional(),
    activeWithinDays: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().int().min(1).max(365).optional(),
    inactiveForDays: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().int().min(1).max(730).optional()
})// Both at once describes an empty audience, which the API would accept and send to nobody.
.refine((v)=>!(v.activeWithinDays && v.inactiveForDays), {
    message: 'Choose either recently active or inactive, not both.',
    path: [
        'inactiveForDays'
    ]
});
const createAnnouncementSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    title: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().min(1, {
        message: 'Add a title.'
    }).max(65),
    body: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().min(1, {
        message: 'Add a message.'
    }).max(500),
    titleUr: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().max(65).optional().or(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal('')),
    bodyUr: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().max(500).optional().or(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal('')),
    segment: segmentSchema,
    channels: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum(ANNOUNCE_CHANNELS)).min(1, {
        message: 'Choose at least one channel.'
    }),
    confirmRecipients: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().int().min(0)
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
const createReportSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    type: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum(REPORT_TYPES),
    format: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum(REPORT_FORMATS).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    cityId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().int().min(1).optional(),
    vendorId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().uuid().optional()
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
const resolveComplaintSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    outcome: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum(COMPLAINT_OUTCOMES),
    note: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().min(3).max(1000).optional().or(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal(''))
})// Rejecting a customer's complaint without saying why is the kind of thing that ends up in a screenshot.
.refine((v)=>v.outcome !== 'REJECT' || v.note && v.note.trim().length >= 3, {
    message: 'Explain why the complaint is being rejected.',
    path: [
        'note'
    ]
});
const createAdminSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    email: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().toLowerCase().email({
        message: 'Enter a valid email address.'
    }).max(254),
    name: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().min(2, {
        message: 'Enter a name.'
    }).max(100),
    password: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(12, {
        message: 'Use at least 12 characters.'
    }).max(200),
    adminRole: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminRole"].SUPER_ADMIN,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminRole"].OPERATIONS,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminRole"].FINANCE,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminRole"].SUPPORT
    ])
});
const updateAdminSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    adminRole: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminRole"].SUPER_ADMIN,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminRole"].OPERATIONS,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminRole"].FINANCE,
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminRole"].SUPPORT
    ]).optional(),
    status: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
        'ACTIVE',
        'DEACTIVATED'
    ]).optional()
});
const changePasswordSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    currentPassword: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(1, {
        message: 'Enter your current password.'
    }).max(200),
    newPassword: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(12, {
        message: 'Use at least 12 characters.'
    }).max(200),
    confirmPassword: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(1)
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
const updateCitySchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    deliveryFee: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().min(0).max(5000, {
        message: 'The delivery fee cannot exceed Rs 5,000.'
    }).refine((n)=>Number.isInteger(n * 100), {
        message: 'At most 2 decimal places.'
    }).optional(),
    isActive: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean().optional(),
    code: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().toUpperCase().regex(/^[A-Z]{2,4}$/, {
        message: 'Use 2–4 letters, e.g. LHR.'
    }).optional(),
    nameUr: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().min(1).max(80).optional().or(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal('')),
    // null puts the city back on our own riders; a UUID hands it to a courier partner.
    courierPartnerId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().uuid().nullable().optional()
});
const PAYOUT_METHODS = [
    __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PayoutMethod"].BANK,
    __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$shared$2f$src$2f$enums$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PayoutMethod"].WALLET
];
}),
"[project]/packages/shared/src/schemas/customer.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
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
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-ssr] (ecmascript) <export * as z .object>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-ssr] (ecmascript) <export * as z .string>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-ssr] (ecmascript) <export * as z .number>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-ssr] (ecmascript) <export * as z .enum>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-ssr] (ecmascript) <export * as z .array>");
;
const discoveryFiltersSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    serviceType: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional(),
    minRating: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().min(1).max(5).optional(),
    maxPrice: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().min(0).optional(),
    sortBy: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
        'distance',
        'rating',
        'price'
    ]).default('distance')
});
const cartItemSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    itemId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    quantity: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().min(1)
});
const cartSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    vendorId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    items: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(cartItemSchema)
});
const slotSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    date: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    startTime: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    endTime: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string()
});
const checkoutDraftSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    cart: cartSchema,
    address: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
        id: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string()
    }),
    pickupSlot: slotSchema,
    deliverySlot: slotSchema,
    paymentMethod: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
        'COD'
    ]),
    notes: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().max(200).optional(),
    idempotencyKey: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional()
});
}),
"[project]/packages/shared/src/schemas/vendor.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
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
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-ssr] (ecmascript) <export * as z .object>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-ssr] (ecmascript) <export * as z .string>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-ssr] (ecmascript) <export * as z .enum>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-ssr] (ecmascript) <export * as z .number>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-ssr] (ecmascript) <export * as z .array>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-ssr] (ecmascript) <export * as z .boolean>");
;
const vendorRegistrationSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    businessName: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(3, 'Business name must be at least 3 characters'),
    businessType: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
        'LAUNDRY',
        'DRY_CLEANER'
    ]),
    shopPhoneNumber: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().regex(/^03\d{9}$/, 'Invalid phone number'),
    shopAddress: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
        address: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(5, 'Address required'),
        lat: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
        lng: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
        city: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string()
    }),
    serviceRadiusKm: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().min(1).max(50),
    ownerName: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(3),
    ownerPhone: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().regex(/^03\d{9}$/),
    cnicNumber: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().length(13, 'CNIC must be 13 digits'),
    cnicPhotoUrl: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().url(),
    shopPhotoUrls: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().url()).min(1, 'At least one shop photo required')
});
const vendorProfileSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    name: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(2),
    locale: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
        'EN',
        'UR'
    ])
});
const catalogItemSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    name: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(1),
    nameUr: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(1),
    category: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    price: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().min(0),
    turnaroundHours: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().min(1),
    active: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean().default(true)
});
const payoutRequestSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    bankIban: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().regex(/^PK\d{2}[A-Z]{4}\d{21}$/),
    amount: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().min(1000),
    notes: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().max(255).optional()
});
}),
];})()

//# sourceMappingURL=_0ud_v6pc0rwco._.js.map