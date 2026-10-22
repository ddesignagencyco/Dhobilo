import type { OpenAPIObject } from '@nestjs/swagger';
import { accessLine, enrichDocument, operationKey } from './enrich';
import type { OperationDocs } from './types';

const baseDoc = (): OpenAPIObject =>
  ({
    openapi: '3.0.0',
    info: { title: 't', version: '1' },
    paths: {
      '/api/v1/things/{id}': {
        post: {
          tags: ['things'],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'limit', in: 'query', required: false, schema: { type: 'number' } },
          ],
          requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/ThingDto' }, example: { old: true } } } },
          responses: { '200': { description: '' } },
          security: [{ bearer: [] }],
        },
      },
      '/api/v1/gone': { delete: { responses: { '204': { description: '' } } } },
      '/api/v1/undocumented': { get: { responses: { '200': { description: '' } } } },
    },
    components: { schemas: {} },
  }) as unknown as OpenAPIObject;

const docs: OperationDocs = {
  'POST /things/{id}': {
    summary: 'Do a thing',
    description: 'Explains the thing.',
    who: ['CUSTOMER', 'ADMIN'],
    tag: 'renamed',
    params: { id: { example: 'abc', description: 'The thing' }, limit: { example: 5 } },
    requests: { default: { summary: 'Typical', value: { name: 'x' } }, other: { summary: 'Other', value: { name: 'y' } } },
    response: { description: 'Done', example: { data: { ok: true } } },
    errors: [{ status: 409, code: 'THING_BUSY', when: 'The thing is busy.' }, { status: 409, code: 'THING_GONE', when: 'The thing is gone.' }],
  },
  'DELETE /gone': { summary: 'Remove it', who: 'public', response: { status: 204 } },
};

describe('enrichDocument', () => {
  const op = () => enrichDocument(baseDoc(), docs).paths['/api/v1/things/{id}'].post as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  it('adds the summary, a "who can use this" line, and the description', () => {
    expect(op().summary).toBe('Do a thing');
    expect(op().description).toBe('**Who can use this:** signed-in customers or admins.\n\nExplains the thing.');
    expect(op().tags).toEqual(['renamed']);
  });

  it('fills parameter examples and notes', () => {
    const [id, limit] = op().parameters;
    expect(id).toMatchObject({ example: 'abc', description: 'The thing' });
    expect(limit.example).toBe(5);
  });

  it('replaces the generated body example with the named examples', () => {
    const json = op().requestBody.content['application/json'];
    expect(json.example).toBeUndefined();
    expect(json.examples).toEqual({ default: { summary: 'Typical', value: { name: 'x' } }, other: { summary: 'Other', value: { name: 'y' } } });
  });

  it('keeps the real success status and attaches the example body', () => {
    expect(op().responses['200']).toMatchObject({ description: 'Done', content: { 'application/json': { example: { data: { ok: true } } } } });
  });

  it('adds standard errors (400, 401, 403) plus the listed ones, grouped by status with one named example per code', () => {
    const r = op().responses;
    expect(Object.keys(r).sort()).toEqual(['200', '400', '401', '403', '409']);
    expect(Object.keys(r['409'].content['application/json'].examples).sort()).toEqual(['THING_BUSY', 'THING_GONE']);
    expect(r['409'].content['application/json'].examples.THING_BUSY.value).toEqual({
      error: { code: 'THING_BUSY', message: 'The thing is busy.', requestId: expect.any(String) },
    });
    expect(r['400'].content['application/json'].examples.VALIDATION_FAILED.value.error.details).toBeDefined();
    expect(r['401'].content['application/json'].schema).toEqual({ $ref: '#/components/schemas/ErrorResponse' });
  });

  it('public operations get no 401/403, and a 204 has no body', () => {
    const del = enrichDocument(baseDoc(), docs).paths['/api/v1/gone'].delete as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(Object.keys(del.responses)).toEqual(['204']);
    expect(del.responses['204'].content).toBeUndefined();
    expect(del.description).toContain('anyone');
  });

  it('registers the shared error schema and leaves undocumented operations untouched', () => {
    const doc = enrichDocument(baseDoc(), docs);
    expect(doc.components!.schemas!.ErrorResponse).toBeDefined();
    expect((doc.paths['/api/v1/undocumented'].get as unknown as Record<string, unknown>).summary).toBeUndefined();
  });
});

describe('helpers', () => {
  it('builds operation keys without the version prefix', () => {
    expect(operationKey('post', '/api/v1/orders/{id}/cancel')).toBe('POST /orders/{id}/cancel');
  });

  it('describes access in plain words', () => {
    expect(accessLine('public')).toContain('anyone');
    expect(accessLine('signed-in')).toContain('any signed-in user');
    expect(accessLine(['VENDOR_OWNER', 'VENDOR_STAFF'])).toContain('vendor owners or vendor staff');
  });
});
