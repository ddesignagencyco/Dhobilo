import type { OpenAPIObject } from '@nestjs/swagger';
import { OPERATION_DOCS } from './index';
import { ID } from './samples';
import type { Access, ErrorDoc, OperationDoc, OperationDocs } from './types';

/* The generated OpenAPI object is deeply dynamic; treat operations as plain records here. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const ROLE_LABEL: Record<string, string> = {
  CUSTOMER: 'customers',
  VENDOR_OWNER: 'vendor owners',
  VENDOR_STAFF: 'vendor staff',
  RIDER: 'riders',
  ADMIN: 'admins',
};
const STATUS_TEXT: Record<number, string> = {
  400: 'Bad request: the input is not valid',
  401: 'Not signed in (or the token expired)',
  403: 'Signed in, but not allowed to do this',
  404: 'Not found',
  409: 'Conflict with the current state',
  422: 'Understood, but cannot be processed',
  429: 'Too many requests',
  500: 'Server error',
  503: 'Service unavailable',
};

export const accessLine = (who: Access): string =>
  who === 'public'
    ? '**Who can use this:** anyone — no sign-in needed.'
    : who === 'signed-in'
      ? '**Who can use this:** any signed-in user.'
      : `**Who can use this:** signed-in ${who.map((r) => ROLE_LABEL[r] ?? r.toLowerCase()).join(' or ')}.`;

export const operationKey = (method: string, path: string) => `${method.toUpperCase()} ${path.replace(/^\/api\/v1/, '')}`;

/** Shared answer schema for every failure, referenced by all error responses. */
const ERROR_SCHEMA: Json = {
  type: 'object',
  description: 'Every failure has this shape. Branch on `error.code` (stable), never on `message` (human text).',
  properties: {
    error: {
      type: 'object',
      properties: {
        code: { type: 'string', example: 'VALIDATION_FAILED', description: 'Stable machine-readable code.' },
        message: { type: 'string', example: 'Request failed validation' },
        details: { description: 'Optional extra facts (field errors, retry-after seconds, …).' },
        requestId: { type: 'string', example: ID.request, description: 'Quote this when reporting a problem.' },
      },
      required: ['code', 'message', 'requestId'],
    },
  },
  required: ['error'],
};

function errorExample(e: Pick<ErrorDoc, 'code' | 'when'>): Json {
  const error: Json = { code: e.code, message: e.when };
  if (e.code === 'VALIDATION_FAILED') {
    error.message = 'Request failed validation';
    error.details = [{ field: 'phone', messages: ['phone must be longer than or equal to 10 characters'] }];
  }
  if (e.code === 'RATE_LIMITED' || e.code === 'ACCOUNT_LOCKED') error.details = { retryAfterSec: 540 };
  return { error: { ...error, requestId: ID.request } };
}

/** The 4xx answers every operation of this kind can give, plus the ones listed for it. */
function errorsFor(op: Json, d: OperationDoc): ErrorDoc[] {
  const auto: ErrorDoc[] = [];
  const hasBody = !!op.requestBody;
  const hasQuery = (op.parameters ?? []).some((p: Json) => p.in === 'query');
  if (hasBody || hasQuery) auto.push({ status: 400, code: 'VALIDATION_FAILED', when: 'Request failed validation' });
  if (d.who !== 'public') auto.push({ status: 401, code: 'UNAUTHENTICATED', when: 'Authentication required.' });
  if (Array.isArray(d.who)) auto.push({ status: 403, code: 'FORBIDDEN', when: 'You do not have access to this resource.' });
  return [...auto, ...(d.errors ?? [])];
}

function describeParameters(op: Json, d: OperationDoc): void {
  for (const p of (op.parameters ?? []) as Json[]) {
    const extra = d.params?.[p.name];
    if (!extra) continue;
    if (extra.example !== undefined) p.example = extra.example;
    if (extra.description) p.description = [p.description, extra.description].filter(Boolean).join(' ');
  }
}

function describeRequest(op: Json, d: OperationDoc): void {
  if (!d.requests || !op.requestBody?.content) return;
  const content = op.requestBody.content as Json;
  const json = content['application/json'];
  const csv = content['text/csv'];
  const jsonEntries = Object.entries(d.requests).filter(([, v]) => typeof v.value !== 'string');
  const csvEntry = Object.entries(d.requests).find(([, v]) => typeof v.value === 'string');
  if (json && jsonEntries.length) {
    delete json.example;
    json.examples = Object.fromEntries(jsonEntries.map(([k, v]) => [k, { summary: v.summary, value: v.value }]));
  }
  if (csv && csvEntry) csv.example = csvEntry[1].value;
}

function describeResponses(op: Json, d: OperationDoc): void {
  const responses: Json = op.responses ?? {};
  // Keep the real success status Nest derived from @HttpCode; replace its body with our description + example.
  const successKey = Object.keys(responses).find((k) => k.startsWith('2')) ?? '200';
  const success = d.response ?? {};
  const noBody = successKey === '204';
  responses[successKey] = {
    description: success.description ?? (noBody ? 'Done (no body)' : 'Success'),
    ...(noBody || success.example === undefined
      ? {}
      : {
          content: {
            [success.contentType ?? 'application/json']:
              success.contentType === 'text/event-stream'
                ? { schema: { type: 'string' }, example: success.example }
                : { schema: { type: 'object' }, example: success.example },
          },
        }),
  };

  const byStatus = new Map<number, ErrorDoc[]>();
  for (const e of errorsFor(op, d)) byStatus.set(e.status, [...(byStatus.get(e.status) ?? []), e]);
  for (const [status, list] of byStatus) {
    responses[String(status)] = {
      description: STATUS_TEXT[status] ?? 'Error',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ErrorResponse' },
          examples: Object.fromEntries(list.map((e) => [e.code, { summary: `${e.code}: ${e.when}`, value: errorExample(e) }])),
        },
      },
    };
  }
  op.responses = responses;
}

/**
 * Merges the hand-written docs (summaries, who can call, examples, error cases) into the generated document.
 * Operations without an entry are left as generated; tests make sure that never happens.
 */
export function enrichDocument(doc: OpenAPIObject, docs: OperationDocs = OPERATION_DOCS): OpenAPIObject {
  doc.components ??= {};
  doc.components.schemas = { ...(doc.components.schemas ?? {}), ErrorResponse: ERROR_SCHEMA };

  for (const [path, item] of Object.entries(doc.paths)) {
    for (const method of METHODS) {
      const op = (item as Json)[method] as Json | undefined;
      const d = op && docs[operationKey(method, path)];
      if (!op || !d) continue;

      op.summary = d.summary;
      op.description = [accessLine(d.who), d.description].filter(Boolean).join('\n\n');
      if (d.tag) op.tags = [d.tag];
      describeParameters(op, d);
      describeRequest(op, d);
      describeResponses(op, d);
    }
  }
  return doc;
}
