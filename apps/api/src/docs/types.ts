import type { Role } from '@prisma/client';

/** One business error an endpoint can answer with (shown as a named example under its status code). */
export interface ErrorDoc {
  status: number;
  code: string;
  /** Plain-language reason, also used as the example message. */
  when: string;
}

export type Access = 'public' | 'signed-in' | Role[];

/**
 * Everything the generated OpenAPI document does not know about an operation. Kept in one place per area
 * (src/docs/ops/*) and checked by a test, so a new endpoint cannot ship without a summary and examples.
 */
export interface OperationDoc {
  summary: string;
  /** Markdown. Explain what it does and what to know before calling it. */
  description?: string;
  /** Who may call it. Verified against the document's security requirements by tests. */
  who: Access;
  /** Overrides the tag set by the controller (to split big areas, e.g. admin). */
  tag?: string;
  /** Success answer. `example` is the whole JSON body (including the `data` / `meta` envelope). */
  response?: { status?: number; description?: string; example?: unknown; contentType?: string };
  /** Request bodies. One entry = the default; several = a dropdown of named examples in Swagger UI. */
  requests?: Record<string, { summary: string; value: unknown }>;
  /** Examples and notes for query, path and header parameters, by name. */
  params?: Record<string, { example?: unknown; description?: string }>;
  /** Business errors beyond the automatic 400 / 401 / 403. */
  errors?: ErrorDoc[];
}

export type OperationDocs = Record<string, OperationDoc>;
