import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Enforces docs/Dhoblio-URDU-GLOSSARY.md.
 *
 * Urdu copy already goes to real customers through the notification templates, and the customer, vendor
 * and rider UIs will add far more of it. A style document nobody can fail is a document that rots, so the
 * rules that can be checked mechanically are checked here:
 *
 *  - the brand name is spelled one way in each language (both wrong forms were live in this repo),
 *  - the "do not use" column of the register table stays unused,
 *  - customers are addressed as آپ, never تم,
 *  - digits stay Latin, because a payout sheet in Urdu-Indic numerals is a support ticket.
 *
 * Deliberately not checked: whether a translation is *good*. That is what the narrow human pass in §6 of
 * the glossary is for.
 */

const REPO_ROOT = resolve(__dirname, '../../../..');
const GLOSSARY = join(REPO_ROOT, 'docs/Dhoblio-URDU-GLOSSARY.md');

/** Files that legitimately contain the counter-examples: the glossary itself and this spec. */
const SELF = ['Dhoblio-URDU-GLOSSARY.md', 'urdu-glossary.spec.ts'];

function sourceFiles(): string[] {
  const roots = [
    join(REPO_ROOT, 'apps/api/src'),
    join(REPO_ROOT, 'apps/api/prisma'),
    join(REPO_ROOT, 'apps/web/src'),
    join(REPO_ROOT, 'packages/shared/src'),
  ];
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return; // apps/web may not exist in a trimmed checkout
    }
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === '.next' || entry === 'dist') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx|json)$/.test(entry)) continue;
      // Generated from the API, so a fix belongs upstream rather than here.
      if (entry === 'schema.d.ts' || entry === 'openapi.json') continue;
      if (SELF.includes(entry)) continue;
      out.push(full);
    }
  };
  roots.forEach(walk);
  return out;
}

const files = sourceFiles();
const contents = new Map(files.map((f) => [f.replace(`${REPO_ROOT}/`, ''), readFileSync(f, 'utf8')]));

/** Every line of every scanned file, tagged with where it came from. */
function offendingLines(pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const [path, text] of contents) {
    text.split('\n').forEach((line, i) => {
      if (pattern.test(line)) hits.push(`${path}:${i + 1}  ${line.trim().slice(0, 120)}`);
    });
  }
  return hits;
}

describe('Urdu glossary', () => {
  it('scanned a meaningful number of files', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('the glossary document exists and names both brand spellings', () => {
    const glossary = readFileSync(GLOSSARY, 'utf8');
    expect(glossary).toContain('Dhoblio');
    expect(glossary).toContain('ڈھوبلیو');
  });

  describe('brand name', () => {
    it('is never spelled Dhobilo outside a repository URL', () => {
      // The GitHub repo is genuinely named Dhobilo, so a URL may contain it; prose and strings may not.
      expect(offendingLines(/(?<!github\.com\/[\w-]+\/)\bDhobilo\b/)).toEqual([]);
    });

    it('is never spelled ڈھوبیلو in Urdu (the letters were transposed in the web app)', () => {
      expect(offendingLines(/ڈھوبیلو/)).toEqual([]);
    });
  });

  describe('register — Pakistani Urdu, not literary Urdu', () => {
    // The "do not use" column of the glossary's register table.
    const banned: Record<string, string> = {
      ترسیل: 'use ڈیلیوری',
      رسانی: 'use ڈیلیوری',
      اطلاقیہ: 'use ایپ',
      'حکم نامہ': 'use آرڈر',
      فرمائش: 'use آرڈر',
    };

    it.each(Object.entries(banned))('does not use %s (%s)', (term, advice) => {
      expect({ term, advice, hits: offendingLines(new RegExp(term)) }).toEqual({ term, advice, hits: [] });
    });
  });

  describe('tone', () => {
    it('addresses people as آپ, never تم', () => {
      // Word-boundary-ish: تم also opens تمام and تمہیں, so require it standalone.
      expect(offendingLines(/(^|[\s"'>(])تم([\s"'<).،۔]|$)/)).toEqual([]);
    });
  });

  describe('numerals', () => {
    it('uses Latin digits, not Urdu-Indic ones', () => {
      // U+0660-0669 Arabic-Indic and U+06F0-06F9 Extended Arabic-Indic.
      expect(offendingLines(/[٠-٩۰-۹]/)).toEqual([]);
    });
  });

  describe('the shipping notification templates', () => {
    const templates = [...contents.entries()].find(([path]) => path.endsWith('order-templates.ts'))?.[1];

    it('were found', () => {
      expect(templates).toBeDefined();
    });

    it('use the glossary terms for the words customers see most', () => {
      // These are the four loanwords the register table is built around; if a future edit "corrects"
      // them to literary Urdu, the banned-term checks above would catch it, and this catches removal.
      for (const term of ['آرڈر', 'ڈیلیوری', 'پک اپ', 'رائیڈر']) {
        expect(templates).toContain(term);
      }
    });

    it('end Urdu sentences with ۔ rather than a full stop', () => {
      const urduBodies = [...(templates ?? '').matchAll(/ur: \{ title: '([^']*)', body: '([^']*)' \}/g)].map(
        ([, , body]) => body,
      );
      expect(urduBodies.length).toBeGreaterThan(5);
      const latinFullStop = urduBodies.filter((body) => /\.(\s|$)/.test(body));
      expect(latinFullStop).toEqual([]);
    });
  });
});
