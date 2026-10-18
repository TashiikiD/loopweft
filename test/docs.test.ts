import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseProject } from '../packages/model/src/index.ts';

const spec = readFileSync(new URL('../docs/format.md', import.meta.url), 'utf8');

/** The JSON code blocks of the specification that are whole projects. */
const projects = [...spec.matchAll(/```json\n([\s\S]*?)```/g)]
  .map((m) => m[1] as string)
  .filter((block) => block.includes('"format": "loopweft"'));

describe('the format specification', () => {
  it('has example projects', () => {
    expect(projects.length).toBeGreaterThanOrEqual(2);
  });

  it('shows only valid projects', () => {
    for (const block of projects) {
      const result = parseProject(JSON.parse(block));
      expect(result.issues.filter((i) => i.severity === 'error')).toEqual([]);
    }
  });

  it('lists every issue code the validator can report', () => {
    /** The codes a source file reports, found by the calls that report them. */
    const codesIn = (file: string, pattern: RegExp) =>
      [
        ...readFileSync(new URL(`../packages/model/src/${file}`, import.meta.url), 'utf8').matchAll(pattern),
      ].map((m) => m[1] as string);
    const codes = [
      ...codesIn('validate.ts', /(?:one\(\s*|code: )'([a-zA-Z]+)'/g),
      ...codesIn('migrate.ts', /fail\(\s*'([a-zA-Z]+)'/g),
      ...codesIn('refs.ts', /(?:error|known)\((?:\s*'[^']*',\s*[a-zA-Z]+,)?\s*'([a-zA-Z]+)'/g),
      ...codesIn('integrity.ts', /warn\(\s*'([a-zA-Z]+)'/g),
      ...codesIn('schema.ts', /params: \{ code: '([a-zA-Z]+)' \}/g),
    ];
    expect(codes).toContain('invalidJson');
    expect(codes.length).toBeGreaterThan(40);
    const missing = [...new Set(codes)].filter((code) => !spec.includes(`\`${code}\``));
    expect(missing).toEqual([]);
  });
});

describe('the templates page', () => {
  it('lists every template', async () => {
    const page = readFileSync(new URL('../docs/templates.md', import.meta.url), 'utf8');
    const { TEMPLATES } = await import('../packages/model/src/index.ts');
    for (const t of TEMPLATES) expect(page, t.id).toContain(`| \`${t.id}\` |`);
    expect(page).toContain('| `polycrisis` |');
  });
});
