// The command line, run in-process on files in a temporary folder. A whole session is compared with a saved
// transcript (expected/session.txt) and the project it leaves (expected/session.loopweft); the other tests
// check the contract agents rely on: one JSON document, exit codes, dry runs, atomic writes with a backup.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readProject } from '@loopweft/model';
import { afterAll, describe, expect, it } from 'vitest';
import { commandNames, main, today } from '../src/main.ts';

const dir = mkdtempSync(join(tmpdir(), 'loopweft-cli-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const env = { today: '2026-10-18' };

/** Runs one command; paths in its output are shown relative to the temporary folder. */
async function run(...args: string[]): Promise<{ code: number; out: string; err: string }> {
  let out = '';
  let err = '';
  const file = (arg: string) => (/\.(loopweft|txt|csv|json|xlsx)$/.test(arg) ? join(dir, arg) : arg);
  const code = await main(args.map(file), { out: (t) => (out += t), err: (t) => (err += t) }, env);
  const local = (text: string) =>
    text
      .split(`${dir}\\`)
      .join('')
      .split(`${dir}/`)
      .join('')
      .split(JSON.stringify(dir).slice(1, -1).concat('\\\\'))
      .join('');
  return { code, out: local(out), err: local(err) };
}

const json = async (...args: string[]) => {
  const result = await run('--json', ...args);
  return { code: result.code, doc: JSON.parse(result.out) as Record<string, unknown> };
};

describe('a session', () => {
  it('builds a map step by step, as the saved transcript shows', async () => {
    const session: string[][] = [
      ['new', 'pop.loopweft', '--title', 'Population'],
      [
        'add',
        'pop.loopweft',
        '--shorthand',
        'Births -> Population (+)\\nPopulation -> Births (+, delay "20 yrs")\\nPopulation -> Deaths (+)\\nDeaths -> Population (-)\\n@group People: Births, Population, Deaths',
      ],
      [
        'var',
        'add',
        'pop.loopweft',
        '--label',
        'Fertility',
        '--definition',
        'Births per woman.',
        '--at',
        '200,300',
      ],
      [
        'link',
        'add',
        'pop.loopweft',
        '--from',
        'fertility',
        '--to',
        'Births',
        '--sign',
        'positive',
        '--confidence',
        'M',
      ],
      ['type', 'role', 'add', 'pop.loopweft', '--name', 'Stock', '--shape', 'rounded-square'],
      [
        'type',
        'field',
        'add',
        'pop.loopweft',
        '--name',
        'Evidence',
        '--kind',
        'choice',
        '--applies-to',
        'links',
        '--option',
        'explicit=Explicit',
        '--option',
        'synthesis=Synthesis',
      ],
      ['var', 'set', 'pop.loopweft', 'Population', '--role', 'stock', '--size', 'large'],
      [
        'link',
        'set',
        'pop.loopweft',
        'L1',
        '--field',
        'Evidence=explicit',
        '--rationale',
        'Each birth adds a person.',
      ],
      ['link', 'flip', 'pop.loopweft', 'L3', '--dry-run'],
      ['var', 'list', 'pop.loopweft'],
      ['link', 'list', 'pop.loopweft'],
      ['loops', 'list', 'pop.loopweft'],
      ['loops', 'add', 'pop.loopweft', '--links', 'L2,L1', '--name', 'More people, more births'],
      [
        'loops',
        'add',
        'pop.loopweft',
        '--links',
        'L3,L4',
        '--name',
        'Deaths',
        '--archetype',
        'Limits to growth',
      ],
      ['layout', 'pop.loopweft', '--auto', 'constellation', '--seed', '2', '--pin', 'fertility'],
      ['layout', 'pop.loopweft', '--home', '960,520,1.1', '--bend', 'L2=0.3', '--label-side', 'deaths=right'],
      ['layout', 'pop.loopweft'],
      ['info', 'pop.loopweft'],
      ['validate', 'pop.loopweft'],
    ];
    const transcript: string[] = [];
    for (const args of session) {
      const { code, out, err } = await run(...args);
      transcript.push(`$ loopweft ${args.map((a) => (/[\s"\\]/.test(a) ? JSON.stringify(a) : a)).join(' ')}`);
      transcript.push((out + err).trimEnd(), `[exit ${code}]`, '');
    }
    await expect(transcript.join('\n')).toMatchFileSnapshot('./expected/session.txt');
    await expect(readFileSync(join(dir, 'pop.loopweft'), 'utf8')).toMatchFileSnapshot(
      './expected/session.loopweft',
    );
  });
});

describe('the contract for agents', () => {
  it('prints one JSON document with --json, wherever the option comes', async () => {
    await run('new', 'json.loopweft', '--title', 'JSON');
    const before = await run('info', 'json.loopweft', '--json');
    const after = await run('--json', 'info', 'json.loopweft');
    expect(before.out).toBe(after.out);
    const doc = JSON.parse(after.out) as { ok: boolean; title: string; counts: { variables: number } };
    expect(doc).toMatchObject({ ok: true, title: 'JSON', counts: { variables: 0 } });
  });

  it('exits 2 for wrong usage, with the reason in error', async () => {
    expect(await json('info', 'missing.loopweft')).toEqual({
      code: 2,
      doc: { ok: false, error: { message: `No file missing.loopweft.`, exitCode: 2 } },
    });
    const usage = await json('link', 'add', 'json.loopweft', '--from', 'a');
    expect(usage.code).toBe(2);
    expect((usage.doc.error as { message: string }).message).toMatch(/required option '--to <variable>'/);
    expect((await json('frobnicate')).code).toBe(2);
    await run('add', 'json.loopweft', '--shorthand', 'A -> B (+)\\nB -> A (-)');
    const conflict = await json('var', 'rm', 'json.loopweft', 'a');
    expect(conflict.code).toBe(2);
    expect((conflict.doc.error as { message: string }).message).toBe(
      'Variable a is still used by 2 links (L1, L2). Remove those first, or remove it with cascade to remove them too.',
    );
  });

  it('exits 1 when the project is invalid or a change would make it so, listing the issues', async () => {
    const shorthand = await json('add', 'json.loopweft', '--shorthand', 'A -> C (upward, weight=heavy)');
    expect(shorthand.code).toBe(1);
    expect(shorthand.doc.error).toMatchObject({
      exitCode: 1,
      issues: [
        {
          severity: 'error',
          line: 1,
          message: 'Unknown item "upward" (use a sign, delay, conf=, weight= or field=value).',
        },
        { severity: 'error', line: 1, message: 'weight must be a number, got "heavy".' },
      ],
    });
    const invalid = await json('var', 'add', 'json.loopweft', '--label', 'X', '--category', 'nowhere');
    expect(invalid.code).toBe(1);
    expect(invalid.doc.error).toMatchObject({ issues: [{ code: 'unknownCategory' }] });

    writeFileSync(
      join(dir, 'broken.loopweft'),
      '{"format":"loopweft","version":1,"meta":{"title":"B"},"links":[{"id":"L1","from":"x","to":"y","sign":"+"}]}',
    );
    const broken = await json('validate', 'broken.loopweft');
    expect(broken.code).toBe(1);
    expect(broken.doc).toMatchObject({ ok: false, valid: false, errors: 2, error: { exitCode: 1 } });
    expect((await run('info', 'broken.loopweft')).code).toBe(1);
  });

  it('changes nothing on a dry run, and says what would change', async () => {
    const file = join(dir, 'json.loopweft');
    const before = readFileSync(file, 'utf8');
    const dry = await json('link', 'flip', 'json.loopweft', 'L1', '--dry-run');
    expect(dry.doc).toMatchObject({
      ok: true,
      summary: 'Flipped L1 (a → b) from + to −.',
      changed: true,
      saved: false,
      dryRun: true,
    });
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('writes atomically, keeps the previous version as .bak, and stamps the date it was changed', async () => {
    const file = join(dir, 'json.loopweft');
    const before = readFileSync(file, 'utf8');
    const done = await json('link', 'flip', 'json.loopweft', 'L1');
    expect(done.doc).toMatchObject({ ok: true, saved: true, backup: 'json.loopweft.bak' });
    expect(readFileSync(`${file}.bak`, 'utf8')).toBe(before);
    const after = readProject(readFileSync(file, 'utf8'));
    expect(after.ok && after.project.meta).toEqual({
      title: 'JSON',
      created: '2026-10-18',
      modified: '2026-10-18',
    });
    expect(existsSync(`${file}.tmp-${process.pid}`)).toBe(false);
    // Nothing to change: nothing is written.
    const same = await json('link', 'set', 'json.loopweft', 'L1', '--sign', '-');
    expect(same.doc).toMatchObject({
      changed: false,
      saved: false,
      summary: 'Nothing to change: link L1 already has those values.',
    });
  });

  it('refuses to replace a file unless told to', async () => {
    expect((await json('new', 'json.loopweft', '--title', 'Again')).code).toBe(2);
    expect((await json('new', 'json.loopweft', '--title', 'Again', '--force')).doc).toMatchObject({
      ok: true,
      backup: 'json.loopweft.bak',
    });
  });

  it('reads today from SOURCE_DATE_EPOCH when it is set, so a run can be repeated exactly', () => {
    expect(today({ SOURCE_DATE_EPOCH: '1792281600' })).toBe('2026-10-18');
    expect(today({}, () => new Date(2026, 0, 2, 23, 30))).toBe('2026-01-02');
  });

  it('runs as a program, through its bin script', () => {
    const bin = fileURLToPath(new URL('../bin/loopweft.mjs', import.meta.url));
    const run = spawnSync(process.execPath, [bin, '--json', 'info', join(dir, 'json.loopweft')], {
      encoding: 'utf8',
    });
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({ ok: true, title: 'Again' });
    const missing = spawnSync(process.execPath, [bin, 'info', join(dir, 'none.loopweft')], {
      encoding: 'utf8',
    });
    expect(missing.status).toBe(2);
    expect(missing.stderr.startsWith('No file ')).toBe(true);
    expect(missing.stderr.endsWith('none.loopweft.\n')).toBe(true);
  });

  it('has the basic commands of the plan', () => {
    expect(commandNames()).toEqual([
      'new',
      'info',
      'validate',
      'add',
      'import',
      'var list',
      'var add',
      'var set',
      'var rm',
      'link list',
      'link add',
      'link set',
      'link rm',
      'link flip',
      'type category add',
      'type category set',
      'type category rm',
      'type category move',
      'type role add',
      'type role set',
      'type role rm',
      'type role move',
      'type link add',
      'type link set',
      'type link rm',
      'type link move',
      'type field add',
      'type field set',
      'type field rm',
      'type field move',
      'loops list',
      'loops add',
      'loops set',
      'loops rm',
      'layout',
    ]);
  });
});

describe('import', () => {
  const fixtures = new URL('../../model/test/fixtures/import/', import.meta.url);
  for (const name of ['links.csv', 'kumu-blueprint.json', 'garden.dataviz.json']) {
    copyFileSync(fileURLToPath(new URL(name, fixtures)), join(dir, name));
  }

  it('makes a map from a links table, lays it out and says what it did', async () => {
    const { code, out } = await run('import', 'links.csv', '-o', 'from-csv.loopweft');
    expect(code).toBe(0);
    expect(out).toBe(
      [
        'Imported 4 variables, 5 links, 2 custom fields.',
        '4 variables were made from link ends that named no variable: workload, stress, sleep_quality, performance.',
        '1 link had no sign: recorded as unknown (?) and flagged; set it to + or -.',
        'No link cites a source yet: Loopweft flags every uncited link.',
        'Read links.csv as links.',
        'Laid out the map with the force layout (seed 1337): moved 4 variables.',
        'Wrote from-csv.loopweft.',
        '',
      ].join('\n'),
    );
    const made = readProject(readFileSync(join(dir, 'from-csv.loopweft'), 'utf8'));
    expect(made.ok && made.project.meta).toEqual({
      title: 'links',
      created: '2026-10-18',
      modified: '2026-10-18',
    });
    expect(made.ok && Object.keys(made.project.layout.positions)).toHaveLength(4);
  });

  it('takes a mapping, a title and no layout when asked', async () => {
    const { doc } = await json(
      'import',
      'links.csv',
      '-o',
      'mapped.loopweft',
      '--map',
      'Notes=ignore',
      '--map',
      'Evidence=field:Evidence:text',
      '--title',
      'Workload',
      '--layout',
      'none',
    );
    expect(doc).toMatchObject({
      ok: true,
      format: 'tables',
      counts: { variables: 4, links: 5 },
      saved: true,
    });
    const made = readProject(readFileSync(join(dir, 'mapped.loopweft'), 'utf8'));
    expect(made.ok && made.project.types.fields).toEqual([
      { id: 'evidence', name: 'Evidence', kind: 'text', appliesTo: 'links' },
    ]);
    expect(made.ok && made.project.layout.positions).toEqual({});
    expect((doc.notes as string[]).includes('Left out the column "Notes" of links.csv, as chosen.')).toBe(
      true,
    );
  });

  it('reads Kumu and DataViz files, keeping the variables DataViz pins where they are', async () => {
    const kumu = await json('import', 'kumu-blueprint.json', '-o', 'kumu.loopweft', '--title', 'Workload');
    expect(kumu.doc).toMatchObject({ ok: true, format: 'kumu', counts: { variables: 4, links: 5 } });
    const dataviz = await json('import', 'garden.dataviz.json', '-o', 'garden.loopweft');
    expect(dataviz.doc).toMatchObject({ ok: true, format: 'dataviz', counts: { variables: 5, links: 6 } });
    const garden = readProject(readFileSync(join(dir, 'garden.loopweft'), 'utf8'));
    expect(garden.ok && garden.project.layout.positions.compost).toEqual({ x: 200, y: 300, pinned: true });
    expect(garden.ok && Object.keys(garden.project.layout.positions)).toHaveLength(5);
  });

  it('writes nothing on a dry run or when the output exists, and stops at what it cannot read', async () => {
    const dry = await json('import', 'links.csv', '-o', 'dry.loopweft', '--dry-run');
    expect(dry.doc).toMatchObject({ ok: true, saved: false, dryRun: true });
    expect(existsSync(join(dir, 'dry.loopweft'))).toBe(false);
    expect((await json('import', 'links.csv', '-o', 'from-csv.loopweft')).code).toBe(2);
    writeFileSync(join(dir, 'bad.csv'), 'From,To,Sign\nA,B,maybe\n');
    const bad = await json('import', 'bad.csv', '-o', 'bad.loopweft');
    expect(bad.code).toBe(1);
    expect(bad.doc.error).toMatchObject({
      exitCode: 1,
      issues: [{ code: 'importProblem', path: ['bad.csv, row 2, sign'] }],
    });
    expect((await json('import', 'links.csv', '-o', 'x.loopweft', '--sign-field', 'Polarity')).code).toBe(2);
    expect((await json('import', 'links.csv', '-o', 'x.loopweft', '--map', 'Nope=from')).code).toBe(2);
  });
});
