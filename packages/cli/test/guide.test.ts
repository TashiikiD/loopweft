// The guide for agents (docs/agents/SKILL.md): `loopweft guide` prints it and installs it, and every command it
// shows really runs, in order, as an agent following it would type them.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { guideBody, guideText } from '../src/guide.ts';
import { commandNames, main } from '../src/main.ts';

const dir = mkdtempSync(join(tmpdir(), 'loopweft-guide-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const env = { today: '2026-01-01' };

async function run(args: string[], cwd = dir) {
  let out = '';
  let err = '';
  const file = (arg: string) => (/\.(loopweft|txt|csv|html)$/.test(arg) ? join(cwd, arg) : arg);
  const code = await main(args.map(file), { out: (t) => (out += t), err: (t) => (err += t) }, env);
  return { code, out, err };
}

/** A command line split as a shell splits it: single quotes literal, double quotes with backslash escapes. */
export function shellWords(line: string): string[] {
  const words: string[] = [];
  const pattern = /'([^']*)'|"((?:[^"\\]|\\.)*)"|(\S+)/g;
  for (const m of line.matchAll(pattern)) words.push(m[1] ?? m[2]?.replace(/\\(.)/g, '$1') ?? m[3] ?? '');
  return words;
}

const guide = guideText();

describe('loopweft guide', () => {
  it('prints the guide', async () => {
    const { code, out } = await run(['guide']);
    expect(code).toBe(0);
    expect(out).toBe(guide);
    const json = await run(['--json', 'guide']);
    expect(JSON.parse(json.out)).toEqual({ ok: true, guide });
  });

  it('is a Claude Code skill: a name, and a description that says when to use it', () => {
    const header = /^---\nname: (.+)\ndescription: (.+)\n---\n/.exec(guide);
    expect(header?.[1]).toBe('loopweft');
    const description = header?.[2] ?? '';
    expect(description.length).toBeGreaterThan(50);
    expect(description.length).toBeLessThanOrEqual(1024);
    expect(description).not.toMatch(/[<>]/);
    expect(description).toMatch(/Use when/);
  });

  it('installs it for Claude Code and as AGENTS.md, and never replaces a file', async () => {
    const folder = join(dir, 'maps');
    mkdirSync(folder);
    const first = await run(['--json', 'guide', '--install', folder]);
    expect(first.code).toBe(0);
    const statuses = (doc: string) =>
      (JSON.parse(doc) as { files: { status: string }[] }).files.map((f) => f.status);
    expect(statuses(first.out)).toEqual(['written', 'written']);
    expect(readFileSync(join(folder, '.claude', 'skills', 'loopweft', 'SKILL.md'), 'utf8')).toBe(guide);
    const agents = readFileSync(join(folder, 'AGENTS.md'), 'utf8');
    expect(agents).toBe(guideBody());
    expect(agents.startsWith('# ')).toBe(true);

    expect(statuses((await run(['--json', 'guide', '--install', folder])).out)).toEqual([
      'current',
      'current',
    ]);

    writeFileSync(join(folder, 'AGENTS.md'), '# Our own notes\n');
    const third = await run(['guide', '--install', folder]);
    expect(third.code).toBe(0);
    expect(third.out).toContain('Left');
    expect(readFileSync(join(folder, 'AGENTS.md'), 'utf8')).toBe('# Our own notes\n');

    const missing = await run(['--json', 'guide', '--install', join(dir, 'nowhere')]);
    expect(missing.code).toBe(2);
  });

  it('names only commands that exist', () => {
    const paths = commandNames();
    const tops = new Set([...paths.map((p) => p.split(' ')[0]), 'help', '--version']);
    const named = [...guide.matchAll(/`loopweft ([a-z-]+)(?: ([a-z]+))?/g)];
    expect(named.length).toBeGreaterThan(10);
    for (const [shown, top = '', sub] of named) {
      expect(tops.has(top), shown).toBe(true);
      const group = paths.filter((p) => p.startsWith(`${top} `));
      if (group.length && sub)
        expect(
          group.some((p) => p.split(' ')[1] === sub),
          shown,
        ).toBe(true);
    }
  });

  it('runs: every command it shows works, in order, and the map ends as its report says', async () => {
    const folder = join(dir, 'walkthrough');
    mkdirSync(folder);
    let ran = 0;
    for (const [, lang, info, body] of guide.matchAll(/```(\w+)([^\n]*)\n([\s\S]*?)```/g)) {
      const file = /file=(\S+)/.exec(info ?? '')?.[1];
      if (file) {
        writeFileSync(join(folder, file), body ?? '');
        continue;
      }
      if (lang !== 'bash') continue;
      for (const line of (body ?? '').split('\n').filter((l) => l.startsWith('loopweft '))) {
        const { code, out, err } = await run(shellWords(line).slice(1), folder);
        expect(code, `${line}\n${out}${err}`).toBe(0);
        ran += 1;
      }
    }
    expect(ran).toBeGreaterThan(25);
    // The report at the end of the guide gives the counts that validate gives the finished map.
    const claim = /`validate`:\s+(\d+)\s+errors,\s+(\d+)\s+warnings/.exec(guide);
    const { out } = await run(['--json', 'validate', 'garden.loopweft'], folder);
    const result = JSON.parse(out) as { errors: number; warnings: number };
    expect([result.errors, result.warnings]).toEqual([Number(claim?.[1]), Number(claim?.[2])]);
    expect(readFileSync(join(folder, 'garden.html')).length).toBeGreaterThan(100_000);
  });
});
