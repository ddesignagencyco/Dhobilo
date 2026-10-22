import { RequestMethod } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { getMetadataStorage } from 'class-validator';
import request from 'supertest';
import { IS_PUBLIC_KEY } from '../src/common/decorators/public.decorator';
import { ROLES_KEY } from '../src/common/decorators/roles.decorator';
import { OPERATION_DOCS } from '../src/docs';
import { operationKey } from '../src/docs/enrich';
import { TAGS } from '../src/docs/swagger.config';
import { TestApp, createTestApp } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;
const METHOD_NAME: Record<number, string> = { [RequestMethod.GET]: 'GET', [RequestMethod.POST]: 'POST', [RequestMethod.PUT]: 'PUT', [RequestMethod.DELETE]: 'DELETE', [RequestMethod.PATCH]: 'PATCH' };

interface DtoField { optional: boolean }

/** Fields a DTO accepts, read from its validators (the same rules that reject unknown/missing fields at runtime). */
function dtoFields(cls: Function): Map<string, DtoField> {
  const fields = new Map<string, DtoField>();
  for (const m of getMetadataStorage().getTargetValidationMetadatas(cls, '', false, false)) {
    const f = fields.get(m.propertyName) ?? { optional: false };
    if (m.type === 'conditionalValidation') f.optional = true;
    fields.set(m.propertyName, f);
  }
  return fields;
}

interface RealRoute { public: boolean; roles?: string[]; bodyDto?: Function; queryDto?: Function }

/** What the code really enforces for every route, read from the decorators (not from the docs). */
function realRoutes(t: TestApp): Map<string, RealRoute> {
  const table = new Map<string, RealRoute>();
  const join = (...parts: string[]) => '/' + parts.flatMap((p) => p.split('/')).filter(Boolean).join('/');
  for (const module of t.app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype as (new () => object) | null;
      if (!controller) continue;
      const base = Reflect.getMetadata('path', controller) as string | string[] | undefined;
      if (base === undefined) continue;
      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = controller.prototype[name as keyof typeof controller.prototype] as unknown as object;
        const method = typeof handler === 'function' ? (Reflect.getMetadata('method', handler) as number | undefined) : undefined;
        if (method === undefined) continue;
        const sub = Reflect.getMetadata('path', handler) as string | string[];
        const path = join('/api/v1', String(Array.isArray(base) ? base[0] : base), String(Array.isArray(sub) ? sub[0] : sub));
        const roles = (Reflect.getMetadata(ROLES_KEY, handler) ?? Reflect.getMetadata(ROLES_KEY, controller)) as string[] | undefined;
        const isPublic = !!(Reflect.getMetadata(IS_PUBLIC_KEY, handler) ?? Reflect.getMetadata(IS_PUBLIC_KEY, controller));
        const args = (Reflect.getMetadata('__routeArguments__', controller, name) ?? {}) as Record<string, { data?: unknown }>;
        const types = (Reflect.getMetadata('design:paramtypes', controller.prototype, name) ?? []) as Function[];
        // The class used for the whole @Body() / @Query() object, if any.
        const dtoFor = (kind: number) => {
          const hit = Object.entries(args).find(([k, v]) => k.startsWith(`${kind}:`) && v.data === undefined);
          const cls = hit ? types[Number(hit[0].split(':')[1])] : undefined;
          return cls && ![String, Number, Boolean, Object, Array].includes(cls as never) ? cls : undefined;
        };
        table.set(operationKey(METHOD_NAME[method], path.replace(/:(\w+)/g, '{$1}')), {
          public: isPublic,
          roles,
          bodyDto: dtoFor(RouteParamtypes.BODY),
          queryDto: dtoFor(RouteParamtypes.QUERY),
        });
      }
    }
  }
  return table;
}

describe('Swagger documentation (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let doc: Json;
  const ops: { key: string; path: string; method: string; op: Json }[] = [];

  beforeAll(async () => {
    t = await createTestApp();
    http = request(t.app.getHttpServer());
    doc = (await http.get('/api/v1/docs-json').expect(200)).body;
    for (const [path, item] of Object.entries<Json>(doc.paths)) {
      for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        if (item[method]) ops.push({ key: operationKey(method, path), path, method, op: item[method] });
      }
    }
  });
  afterAll(() => t.close());

  const resolve = (ref: string): Json => ref.replace('#/', '').split('/').reduce((o: Json, k) => o[k], doc);

  describe('completeness', () => {
    it('every endpoint has hand-written docs, and there are no docs for endpoints that do not exist', () => {
      const real = new Set(ops.map((o) => o.key));
      const documented = new Set(Object.keys(OPERATION_DOCS));
      expect([...real].filter((k) => !documented.has(k))).toEqual([]);
      expect([...documented].filter((k) => !real.has(k))).toEqual([]);
    });

    it('every endpoint has a summary, a description, a tag from the declared list and a success example', () => {
      const tags = new Set(TAGS.map(([name]) => name));
      for (const { key, op } of ops) {
        const problems: string[] = [];
        if (!op.summary || op.summary.length < 5) problems.push('summary');
        if (!op.description || op.description.length < 30) problems.push('description');
        if (!op.tags?.length || !op.tags.every((x: string) => tags.has(x))) problems.push(`tag(${op.tags})`);
        const success = Object.keys(op.responses).find((c) => c.startsWith('2'));
        if (!success) problems.push('success response');
        else if (success !== '204' && !Object.values<Json>(op.responses[success].content ?? {})[0]?.example) problems.push('success example');
        expect({ key, problems }).toEqual({ key, problems: [] });
      }
    });

    it('every tag in the declared list is used, in the declared order', () => {
      const used = new Set(ops.flatMap((o) => o.op.tags as string[]));
      for (const [name] of TAGS) expect({ name, used: used.has(name) }).toEqual({ name, used: true });
      expect(doc.tags.map((x: Json) => x.name)).toEqual(TAGS.map(([name]) => name));
      expect(doc.tags.every((x: Json) => x.description?.length > 10)).toBe(true);
    });
  });

  describe('truthfulness', () => {
    it('"who can use this" matches the access rules the code actually enforces', () => {
      const real = realRoutes(t);
      const wrong: string[] = [];
      for (const { key, op } of ops) {
        const route = real.get(key);
        const d = OPERATION_DOCS[key];
        if (!route) {
          wrong.push(`${key}: not found among controllers`);
          continue;
        }
        const claimed = d.who === 'public' ? 'public' : d.who === 'signed-in' ? 'signed-in' : [...d.who].sort().join(',');
        const actual = route.public ? 'public' : route.roles?.length ? [...route.roles].sort().join(',') : 'signed-in';
        if (claimed !== actual) wrong.push(`${key}: docs say "${claimed}" but the code enforces "${actual}"`);
        // and the padlock shown in the UI agrees
        if (!!op.security?.length === route.public) wrong.push(`${key}: padlock disagrees with the public/private rule`);
      }
      expect(wrong).toEqual([]);
    });

    it('401 is documented exactly where sign-in is needed, 403 exactly where roles are restricted', () => {
      for (const { key, op } of ops) {
        const d = OPERATION_DOCS[key];
        // sign-in needed => 401 is always documented; otherwise only when a specific 401 case is listed (e.g. refresh)
        const explicit401 = (d.errors ?? []).some((e) => e.status === 401);
        expect({ key, has401: '401' in op.responses }).toEqual({ key, has401: d.who !== 'public' || explicit401 });
        // restricted by role => 403 is always documented; otherwise only when a specific 403 case is listed
        const explicit403 = (d.errors ?? []).some((e) => e.status === 403);
        expect({ key, has403: '403' in op.responses }).toEqual({ key, has403: Array.isArray(d.who) || explicit403 });
      }
    });

    it('the documented success status is the status the server really uses', () => {
      for (const { key, op } of ops) {
        const declared = OPERATION_DOCS[key].response?.status;
        if (declared) expect({ key, status: Object.keys(op.responses).find((c) => c.startsWith('2')) }).toEqual({ key, status: String(declared) });
      }
    });

    it('every documented error code is a real 4xx/5xx status with a well-formed example', () => {
      for (const { key, op } of ops) {
        for (const [status, response] of Object.entries<Json>(op.responses)) {
          if (status.startsWith('2')) continue;
          expect(Number(status)).toBeGreaterThanOrEqual(400);
          for (const [code, example] of Object.entries<Json>(response.content['application/json'].examples)) {
            expect({ key, status, code, shape: Object.keys(example.value.error).sort() }).toMatchObject({
              shape: expect.arrayContaining(['code', 'message', 'requestId']),
            });
            expect(example.value.error.code).toBe(code);
          }
        }
      }
    });
  });

  describe('request examples', () => {
    it('operations with a body have examples; operations without one have none documented', () => {
      for (const { key, op } of ops) {
        const hasBody = !!op.requestBody;
        const documented = !!OPERATION_DOCS[key].requests;
        // media/sign and similar all have bodies; cart DELETE etc. do not
        expect({ key, body: hasBody, documented }).toEqual({ key, body: hasBody, documented: hasBody });
      }
    });

    it('every body example only uses fields the endpoint accepts and, unless it is a partial update, includes all required ones', () => {
      const real = realRoutes(t);
      for (const { key, op } of ops) {
        const dto = real.get(key)?.bodyDto;
        const json = op.requestBody?.content?.['application/json'];
        if (!dto || !json?.examples) continue;
        const fields = dtoFields(dto);
        const required = [...fields].filter(([, f]) => !f.optional).map(([name]) => name);
        for (const [name, ex] of Object.entries<Json>(json.examples)) {
          const keys = Object.keys(ex.value);
          expect({ key, example: name, unknown: keys.filter((k) => !fields.has(k)) }).toEqual({ key, example: name, unknown: [] });
          if (!key.startsWith('PATCH')) expect({ key, example: name, missing: required.filter((r) => !keys.includes(r)) }).toEqual({ key, example: name, missing: [] });
        }
      }
    });

    it('every path parameter has a ready-to-run example, and every other parameter an example or an explanation', () => {
      for (const { key, op } of ops) {
        for (const p of (op.parameters ?? []) as Json[]) {
          if (p.in === 'path') expect({ key, param: p.name, example: p.example !== undefined }).toEqual({ key, param: p.name, example: true });
          else expect({ key, param: p.name, ok: p.example !== undefined || !!p.description }).toEqual({ key, param: p.name, ok: true });
        }
      }
    });

    it('documented parameters exist, and every query field the endpoint accepts is documented', () => {
      const real = realRoutes(t);
      const wrong: string[] = [];
      for (const { key, op } of ops) {
        const d = OPERATION_DOCS[key];
        const queryFields = real.get(key)?.queryDto ? [...dtoFields(real.get(key)!.queryDto!).keys()] : [];
        const known = new Set([...((op.parameters ?? []) as Json[]).map((p) => p.name as string), ...queryFields]);
        for (const name of Object.keys(d.params ?? {})) if (!known.has(name)) wrong.push(`${key}: docs describe parameter "${name}" which does not exist`);
        for (const field of queryFields) {
          const doc = d.params?.[field];
          if (!doc || (doc.example === undefined && !doc.description)) wrong.push(`${key}: query field "${field}" has no example or description`);
        }
      }
      expect(wrong).toEqual([]);
    });
  });

  describe('the page itself', () => {
    it('serves JSON and YAML documents and the interactive UI', async () => {
      expect((await http.get('/api/v1/docs-yaml').expect(200)).text).toContain('openapi: 3.');
      const ui = await http.get('/api/v1/docs').expect(200);
      expect(ui.text).toContain('Dhoblio API docs');
      expect(doc.info.title).toBe('Dhoblio API');
      expect(doc.servers[0].url).toBe('http://localhost:4000');
    });

    it('is interactive: try-it-out on, login persisted, token captured automatically after sign-in', async () => {
      const init = (await http.get('/api/v1/docs/swagger-ui-init.js').expect(200)).text;
      for (const option of ['"persistAuthorization": true', '"tryItOutEnabled": true', '"displayRequestDuration": true', '"filter": true', '"docExpansion": "none"']) {
        expect(init).toContain(option);
      }
      // the sign-in helper script is inlined in the page itself
      const html = (await http.get('/api/v1/docs').expect(200)).text;
      expect(html).toMatch(/preauthorizeApiKey\('bearer'/);
      expect(html).toContain('otp\\/verify');
      expect(html).toContain('authActions.logout');
    });

    it('the Authorize button is wired to the bearer scheme the script fills in', () => {
      expect(doc.components.securitySchemes.bearer).toMatchObject({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' });
    });

    it('the introduction explains how to get started and lists the demo accounts', () => {
      expect(doc.info.description).toContain('Try it in 30 seconds');
      expect(doc.info.description).toContain('123456');
      expect(doc.info.description).toContain('03000000011');
      expect(doc.info.description).toContain('admin@dhoblio.local');
    });

    it('declares the shared error shape', () => {
      expect(doc.components.schemas.ErrorResponse.properties.error.required).toEqual(['code', 'message', 'requestId']);
    });
  });
});
