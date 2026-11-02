import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The web app mirrors the Prisma enums by hand in packages/shared/src/enums.ts, because it cannot import
 * @prisma/client. This test fails if one of those mirrors drifts from the schema, which would otherwise
 * show up as a status badge that never renders or a filter that silently matches nothing.
 *
 * Both files are read as text on purpose: the API must not depend on the shared package's build, and
 * parsing the schema beats importing a generated client that may be out of date.
 */

const REPO_ROOT = resolve(__dirname, '../../../..');

function prismaEnums(): Map<string, string[]> {
  const schema = readFileSync(resolve(REPO_ROOT, 'apps/api/prisma/schema.prisma'), 'utf8');
  const out = new Map<string, string[]>();
  for (const match of schema.matchAll(/^enum\s+(\w+)\s*\{([^}]*)\}/gm)) {
    const [, name, body] = match;
    const members = body
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, '').trim())
      .filter((line) => /^\w+$/.test(line));
    out.set(name, members);
  }
  return out;
}

function mirroredEnums(): Map<string, string[]> {
  const source = readFileSync(resolve(REPO_ROOT, 'packages/shared/src/enums.ts'), 'utf8');
  const out = new Map<string, string[]>();
  // export const Name = { A: 'A', B: 'B' } as const;
  for (const match of source.matchAll(/export const (\w+) = \{([^}]*)\} as const;/g)) {
    const [, name, body] = match;
    const members = [...body.matchAll(/(\w+)\s*:\s*'([^']+)'/g)].map(([, key, value]) => {
      expect(value).toBe(key); // a mirror whose value differs from its key would break every API comparison
      return key;
    });
    out.set(name, members);
  }
  return out;
}

describe('shared enum mirrors', () => {
  const schema = prismaEnums();
  const mirrors = mirroredEnums();

  it('reads both files', () => {
    expect(schema.size).toBeGreaterThan(20);
    expect(mirrors.size).toBeGreaterThan(20);
  });

  it.each([...mirrors.keys()])('%s matches the Prisma schema', (name) => {
    const fromSchema = schema.get(name);
    expect(fromSchema).toBeDefined();
    // Order does not matter, membership does.
    expect([...mirrors.get(name)!].sort()).toEqual([...fromSchema!].sort());
  });
});
