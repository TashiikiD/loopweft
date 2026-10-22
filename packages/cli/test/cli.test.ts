// The command line, run in-process on files in a temporary folder. A whole session is compared with a saved
// transcript (expected/session.txt) and the project it leaves (expected/session.loopweft); the other tests
// check the contract agents rely on: one JSON document, exit codes, dry runs, atomic writes with a backup.
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  linkSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { readProject } from '@loopweft/model';
import { afterAll, describe, expect, it } from 'vitest';
import { recordedFetch } from '../scripts/recorded-fetch.ts';
import { commandNames, main, today } from '../src/main.ts';

const dir = mkdtempSync(join(tmpdir(), 'loopweft-cli-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** The DOI lookup answers from the Crossref and DataCite replies recorded for the model's tests: no network. */
const env = { today: '2026-10-18', fetch: recordedFetch };

/** Runs one command; paths in its output are shown relative to the temporary folder. */
async function run(...args: string[]): Promise<{ code: number; out: string; err: string }> {
  let out = '';
  let err = '';
  const file = (arg: string) => (/\.(loopweft|txt|csv|json|xlsx|png|html)$/.test(arg) ? join(dir, arg) : arg);
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

/** The project a file in the temporary folder holds now. */
const saved = (file: string) => {
  const read = readProject(readFileSync(join(dir, file), 'utf8'));
  if (!read.ok) throw new Error(`${file} does not read as a project.`);
  return read.project;
};

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
      [
        'source',
        'add',
        'pop.loopweft',
        '--apa',
        'Test, A. (2020). *A fictitious source for tests*. Test Press.',
        '--label',
        'Test (2020)',
        '--summary',
        'Test data, not a real work.',
      ],
      ['source', 'lookup', 'https://doi.org/10.1017/sus.2024.1'],
      ['source', 'add', 'pop.loopweft', '--doi', '10.1017/sus.2025.14', '--dry-run'],
      ['source', 'add', 'pop.loopweft', '--doi', '10.6084/m9.figshare.c.6858564', '--dry-run'],
      ['source', 'add', 'pop.loopweft', '--doi', '10.9999/not.registered.anywhere'],
      ['cite', 'add', 'pop.loopweft', 'L1,L2', 'test2020', '--pages', '4–5', '--strength', 'moderate'],
      ['cite', 'add', 'pop.loopweft', 'Births,L1', 'test2020', '--pages', '4–5'],
      ['cite', 'set', 'pop.loopweft', 'L1', 'test2020', '--strength', 'strong', '--note', 'Fig. 2'],
      ['cite', 'list', 'pop.loopweft'],
      ['cite', 'list', 'pop.loopweft', '--uncited'],
      ['source', 'list', 'pop.loopweft'],
      ['source', 'show', 'pop.loopweft', 'Test (2020)'],
      ['references', 'pop.loopweft', '--markdown'],
      ['source', 'rm', 'pop.loopweft', 'test2020', '--dry-run'],
      ['ripple', 'pop.loopweft', 'Births', 'up'],
      ['ripple', 'pop.loopweft', 'deaths', 'down', '--max-steps', '1'],
      ['paths', 'pop.loopweft', 'Fertility', 'Deaths'],
      ['paths', 'pop.loopweft', 'deaths', 'fertility'],
      ['connected', 'pop.loopweft', '--limit', '3'],
      ['layout', 'pop.loopweft', '--auto', 'constellation', '--seed', '2', '--pin', 'fertility'],
      ['layout', 'pop.loopweft', '--home', '960,520,1.1', '--bend', 'L2=0.3', '--label-side', 'deaths=right'],
      ['layout', 'pop.loopweft'],
      [
        'story',
        'scene',
        'add',
        'pop.loopweft',
        '--title',
        'Growth',
        '--headline',
        'Births feed the population.',
        '--target',
        '60',
      ],
      ['story', 'step', 'add', 'pop.loopweft', 'S1', '--label', 'The map', '--labels', 'all'],
      [
        'story',
        'step',
        'add',
        'pop.loopweft',
        'Growth',
        '--label',
        'The loop',
        '--at',
        '20',
        '--base',
        'dim',
        '--link-base',
        'ghost',
        '--focus',
        'Births,Population',
        '--active',
        'L1,L2',
        '--frame',
        'births,population',
        '--frame-at',
        'right',
        '--spread',
        'births=up',
        '--name',
        'R1',
        '--pulse-loop',
        'R1',
        '--labels',
        'focus',
      ],
      ['story', 'step', 'copy', 'pop.loopweft', 'S1.2', '--label', 'Deaths push back'],
      [
        'story',
        'step',
        'set',
        'pop.loopweft',
        'S1.3',
        '--at',
        '40',
        '--active',
        'L3,L4',
        '--unlist',
        'L1,L2',
        '--hide-badge',
        'R1',
        '--clear-pulses',
        '--pulse',
        'L3',
        '--pulse',
        'L4',
        '--up',
        'deaths',
      ],
      ['story', 'overlay', 'add', 'pop.loopweft', 'S1.2', 'caption'],
      [
        'story',
        'overlay',
        'add',
        'pop.loopweft',
        'S1.2',
        'statement',
        '--line',
        'More people, more births.',
        '--style',
        'question',
        '--place',
        'bottom',
        '--cite',
        'test2020:4–5',
      ],
      ['story', 'image', 'add', 'pop.loopweft', 'chart.png'],
      [
        'story',
        'overlay',
        'add',
        'pop.loopweft',
        'S1.1',
        'image',
        '--image',
        'chart',
        '--alt',
        'A test chart',
        '--credit',
        'Test data',
      ],
      [
        'story',
        'scene',
        'set',
        'pop.loopweft',
        'S1',
        '--script',
        'The map. [>] The loop. [>] Deaths push back.',
      ],
      ['story', 'list', 'pop.loopweft'],
      ['story', 'show', 'pop.loopweft', 'S1.2'],
      ['story', 'show', 'pop.loopweft', 'S1.3'],
      ['story', 'show', 'pop.loopweft', 'S1'],
      ['story', 'step', 'move', 'pop.loopweft', 'S1.3', '--first', '--dry-run'],
      ['info', 'pop.loopweft'],
      ['validate', 'pop.loopweft'],
    ];
    // A 1×1 PNG for the image overlay.
    writeFileSync(
      join(dir, 'chart.png'),
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64',
      ),
    );
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
      'guide',
      'new',
      'info',
      'validate',
      'meta',
      'theme',
      'add',
      'import',
      'export',
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
      'ripple',
      'paths',
      'connected',
      'source list',
      'source show',
      'source lookup',
      'source add',
      'source set',
      'source rm',
      'cite list',
      'cite add',
      'cite set',
      'cite rm',
      'references',
      'layout',
      'story list',
      'story show',
      'story scene add',
      'story scene set',
      'story scene rm',
      'story scene move',
      'story step add',
      'story step set',
      'story step rm',
      'story step move',
      'story step copy',
      'story overlay add',
      'story overlay set',
      'story overlay rm',
      'story overlay move',
      'story image add',
      'story image set',
      'story image rm',
    ]);
  });

  it('says why a DOI lookup failed, in JSON too, and adds nothing', async () => {
    await run('new', 'doi.loopweft', '--title', 'DOI');
    const before = readFileSync(join(dir, 'doi.loopweft'), 'utf8');
    const missing = await json(
      'source',
      'add',
      'doi.loopweft',
      '--doi',
      'doi:10.9999/not.registered.anywhere',
    );
    expect(missing.code).toBe(2);
    expect(missing.doc).toMatchObject({
      ok: false,
      doi: '10.9999/not.registered.anywhere',
      lookup: { kind: 'notFound', status: 404 },
      error: {
        exitCode: 2,
        message: expect.stringMatching(/^Neither Crossref nor DataCite has a record of 10\.9999/),
      },
    });
    const notDoi = await json('source', 'lookup', 'sus.2024.1');
    expect(notDoi).toMatchObject({ code: 2, doc: { ok: false, lookup: { kind: 'invalidDoi' } } });
    expect((await json('source', 'add', 'doi.loopweft', '--doi', 'nope')).doc).toMatchObject({
      error: { message: expect.stringMatching(/^--doi: “nope” is not a DOI/) },
    });
    expect(readFileSync(join(dir, 'doi.loopweft'), 'utf8')).toBe(before);
  });

  it('adds a source by hand without the network, and from a DOI with the lookup’s notes', async () => {
    const offline = (async () => {
      throw new TypeError('offline');
    }) as typeof fetch;
    let out = '';
    const io = { out: (t: string) => (out += t), err: (t: string) => (out += t) };
    const file = join(dir, 'doi.loopweft');
    const by = [
      '--apa',
      'Test, A. (2020). *A fictitious source for tests*. Test Press.',
      '--doi',
      '10.1234/test.1',
    ];
    expect(await main(['source', 'add', file, ...by], io, { ...env, fetch: offline })).toBe(0);
    expect(out).toBe('Added source test2020.\n');
    out = '';
    expect(await main(['source', 'lookup', '10.1017/sus.2024.1'], io, { ...env, fetch: offline })).toBe(2);
    expect(out).toBe(
      'Could not reach Crossref (api.crossref.org): check the internet connection, or enter the reference by hand.\n',
    );
    const added = await json(
      'source',
      'add',
      'doi.loopweft',
      '--doi',
      '10.1108/ijccsm-02-2022-0016',
      '--id',
      'R',
    );
    expect(added.doc).toMatchObject({
      ok: true,
      result: { id: 'R' },
      lookup: {
        agency: 'Crossref',
        type: 'journal-article',
        notes: [{ level: 'check' }, { level: 'warning' }],
      },
    });
  });
});

describe('import', () => {
  const fixtures = new URL('../../model/test/fixtures/import/', import.meta.url);
  for (const name of ['links.csv', 'kumu-blueprint.json', 'kumu-export.json', 'garden.dataviz.json']) {
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
    // Kumu's export: its project name, its map's places (Reviews floats, so it is laid out) and its loops.
    const exported = await json('import', 'kumu-export.json', '-o', 'rush.loopweft');
    expect(exported.doc).toMatchObject({ ok: true, format: 'kumu', counts: { variables: 5, links: 6 } });
    const rush = readProject(readFileSync(join(dir, 'rush.loopweft'), 'utf8'));
    if (!rush.ok) throw new Error('not valid');
    expect(rush.project.meta.title).toBe('Morning rush');
    expect(rush.project.layout.positions.customers).toEqual({ x: 560, y: 540, pinned: true });
    expect(Object.keys(rush.project.layout.positions)).toHaveLength(5);
    expect(rush.project.layout.positions.service_speed).not.toEqual({ x: 2160, y: 540 });
    expect(rush.project.loops.map((l) => l.id)).toEqual(['B1', 'B2']);
    // Not laid out, the map keeps every place Kumu gives, floating ones too; Reviews has none.
    await json('import', 'kumu-export.json', '-o', 'rush-as-is.loopweft', '--layout', 'none');
    const asIs = readProject(readFileSync(join(dir, 'rush-as-is.loopweft'), 'utf8'));
    if (!asIs.ok) throw new Error('not valid');
    expect(asIs.project.layout.positions.service_speed).toEqual({ x: 2160, y: 540 });
    expect(Object.keys(asIs.project.layout.positions)).toHaveLength(4);
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

describe('templates', () => {
  it('starts a map from an archetype, or from the polycrisis example', async () => {
    const { code, out } = await run('new', 'fixes.loopweft', '--template', 'fixes-that-fail');
    expect(code).toBe(0);
    expect(out).toBe('Created fixes.loopweft: "Fixes that fail" from the template fixes-that-fail.\n');
    const fixes = readProject(readFileSync(join(dir, 'fixes.loopweft'), 'utf8'));
    expect(fixes.ok && fixes.project.variables.map((v) => v.label)).toEqual([
      'Problem symptom',
      'Fix',
      'Unintended consequence',
    ]);
    expect(fixes.ok && fixes.project.meta.created).toBe('2026-10-18');
    const example = await json('new', 'example.loopweft', '--template', 'polycrisis', '--title', 'My copy');
    expect(example.doc).toMatchObject({ ok: true, title: 'My copy', template: 'polycrisis' });
    const copy = readProject(readFileSync(join(dir, 'example.loopweft'), 'utf8'));
    expect(copy.ok && copy.project.variables).toHaveLength(41);
  });

  it('needs a title for a blank map, and names the templates when one is unknown', async () => {
    expect((await json('new', 'untitled.loopweft')).doc).toMatchObject({
      ok: false,
      error: { message: 'Give the new map a title with --title.', exitCode: 2 },
    });
    const unknown = await json('new', 'x.loopweft', '--template', 'limits');
    expect(unknown.code).toBe(2);
    expect((unknown.doc.error as { message: string }).message).toMatch(
      /^No template "limits"; the templates are blank, /,
    );
  });
});

describe('ripple', () => {
  it("gives agents the model's ripple, and refuses a start or a direction it cannot use", async () => {
    await run('new', 'fixes-ripple.loopweft', '--template', 'fixes-that-fail');
    const up = await json('ripple', 'fixes-ripple.loopweft', 'Fix', 'up');
    expect(up.code).toBe(0);
    expect(up.doc).toMatchObject({ ok: true, start: 'fix', direction: 'up', capped: false });
    expect(Array.isArray(up.doc.reached) && up.doc.reached.length).toBeGreaterThan(0);
    const sideways = await json('ripple', 'fixes-ripple.loopweft', 'Fix', 'sideways');
    expect(sideways.doc).toMatchObject({
      ok: false,
      error: { message: 'A ripple starts with a rise (up) or a fall (down), not "sideways".', exitCode: 2 },
    });
    expect((await json('ripple', 'fixes-ripple.loopweft', 'Nothing', 'up')).code).toBe(2);
    expect(
      (await json('ripple', 'fixes-ripple.loopweft', 'Fix', 'up', '--max-steps', '0')).doc,
    ).toMatchObject({
      ok: false,
      error: { message: '--max-steps must be a whole number, 1 or more, not "0".', exitCode: 2 },
    });
  });

  it('tells the ripple by the variables’ names, each way in words beside its mark', async () => {
    await run('new', 'prices.loopweft', '--title', 'Prices');
    await run(
      'add',
      'prices.loopweft',
      '--shorthand',
      'Food prices -> Farm income (+)\\nFood prices -> Buying power (-)\\nFarm income -> Rural spending (+)\\nBuying power -> Rural spending (+)',
    );
    const out = await run('ripple', 'prices.loopweft', 'food_prices', 'up');
    expect(out.out.split('\n')).toEqual([
      'For a rise in Food prices, the change reaches 3 variables in 2 steps: 1 variable rising ▲, 1 variable falling ▼, 1 variable pushed both ways ±.',
      '  step 1  ▼ Buying power: falling, via L2',
      '  step 1  ▲ Farm income: rising, via L1',
      '  step 2  ± Rural spending: pushed both ways, via L4, L3',
      '± (pushed both ways) where opposing pushes arrive together: the signs alone cannot tell which wins, so the ripple goes no further from there.',
      "Directions only, from the links' signs: not how much or how soon.",
      '',
    ]);
    // The data stays by id, for agents.
    const data = await json('ripple', 'prices.loopweft', 'Food prices', 'up');
    expect(data.doc).toMatchObject({ start: 'food_prices' });
    expect((data.doc.reached as unknown[])[0]).toMatchObject({ variable: 'buying_power', trend: 'down' });
  });

  it('names the links it would not cross from the last variables --max-steps reaches', async () => {
    await run('new', 'unknown.loopweft', '--title', 'Unknown');
    await run('add', 'unknown.loopweft', '--shorthand', 'Rain -> River level (+)\\nRiver level -> Fish (?)');
    const short = await json('ripple', 'unknown.loopweft', 'Rain', 'up', '--max-steps', '1');
    expect(short.doc).toMatchObject({ unknownLinks: ['L2'], capped: false });
    expect((await run('ripple', 'unknown.loopweft', 'Rain', 'up', '--max-steps', '1')).out).toContain(
      'Not crossed: 1 link of unknown sign (L2).',
    );
  });

  it('says it stopped when only feedback lies past --max-steps', async () => {
    await run('new', 'loop.loopweft', '--title', 'Loop');
    await run('add', 'loop.loopweft', '--shorthand', 'Stock -> Outflow (+)\\nOutflow -> Stock (-)');
    const short = await json('ripple', 'loop.loopweft', 'Stock', 'up', '--max-steps', '1');
    expect(short.doc).toMatchObject({ feedback: [], capped: true });
    const text = await run('ripple', 'loop.loopweft', 'Stock', 'up', '--max-steps', '1');
    expect(text.out).toContain('Stopped after 1 step (--max-steps): there is more to the change.');
    expect((await run('ripple', 'loop.loopweft', 'Stock', 'up')).out).toContain(
      'Back to Stock at step 2 along L2: ▼ falling, the other way, so the loop counters it.',
    );
  });
});

describe('the story commands', () => {
  /** A new project: a link A → B, and scene S1 ("One") with one step, S1.1 ("First"). */
  async function oneStep(file: string) {
    await run('new', file, '--title', 'Story');
    await run('add', file, '--shorthand', 'A -> B (+)');
    await run('story', 'scene', 'add', file, '--title', 'One');
    await run('story', 'step', 'add', file, 'S1', '--label', 'First');
  }

  it('refuse what they cannot do, saying why, and change nothing', async () => {
    await oneStep('story.loopweft');
    const before = readFileSync(join(dir, 'story.loopweft'), 'utf8');
    const nothing = await json('story', 'step', 'set', 'story.loopweft', 'S1.1');
    expect(nothing.code).toBe(2);
    expect((nothing.doc.error as { message: string }).message).toMatch(/^Nothing to change/);
    expect((await json('story', 'overlay', 'add', 'story.loopweft', 'S1.1', 'poster')).code).toBe(2);
    expect((await json('story', 'step', 'set', 'story.loopweft', 'S1.1', '--map', '{nope')).code).toBe(2);
    expect((await json('story', 'step', 'set', 'story.loopweft', 'S1.1', '--focus', 'C')).code).toBe(2);
    expect((await json('story', 'step', 'set', 'story.loopweft', 'S1.1', '--opacity', '3')).code).toBe(1);
    expect((await json('story', 'scene', 'rm', 'story.loopweft', 'S1')).code).toBe(2);
    writeFileSync(join(dir, 'notes.txt'), 'not an image');
    const image = await json('story', 'image', 'add', 'story.loopweft', 'notes.txt');
    expect(image.code).toBe(2);
    expect((image.doc.error as { message: string }).message).toMatch(
      /is not a PNG, JPEG, GIF, WebP or SVG image\.$/,
    );
    expect(readFileSync(join(dir, 'story.loopweft'), 'utf8')).toBe(before);
  });

  it('replace a whole map state from JSON, then refine it, and show it as JSON', async () => {
    await oneStep('story-map.loopweft');
    const out = await json(
      'story',
      'step',
      'set',
      'story-map.loopweft',
      'S1.1',
      '--map',
      '{"labels":"none","trends":{"a":"up"}}',
      '--focus',
      'a',
    );
    expect(out.code).toBe(0);
    const shown = await json('story', 'show', 'story-map.loopweft', 'S1.1');
    expect(shown.doc).toMatchObject({
      ok: true,
      key: 'S1.1',
      step: { map: { labels: 'none', trends: { a: 'up' }, variables: { focus: ['a'] } } },
    });
  });

  it('refuse an empty list of variables or links for a level, changing nothing', async () => {
    await oneStep('story-levels.loopweft');
    const before = readFileSync(join(dir, 'story-levels.loopweft'), 'utf8');
    for (const option of ['--hidden', '--ghost', '--dim', '--normal', '--focus', '--active', '--unlist']) {
      for (const value of ['', ' , ']) {
        const out = await json('story', 'step', 'set', 'story-levels.loopweft', 'S1.1', option, value);
        expect(out.code, `${option} "${value}"`).toBe(2);
        expect((out.doc.error as { message: string }).message).toBe(
          `Name at least one variable or link for ${option}.`,
        );
      }
    }
    const added = await json(
      'story',
      'step',
      'add',
      'story-levels.loopweft',
      'S1',
      '--label',
      'E',
      '--focus',
      '',
    );
    expect(added.code).toBe(2);
    expect(readFileSync(join(dir, 'story-levels.loopweft'), 'utf8')).toBe(before);
  });

  it('keep the type argument of a new overlay: --overlay may repeat it, not change it', async () => {
    await oneStep('story-overlay.loopweft');
    const before = readFileSync(join(dir, 'story-overlay.loopweft'), 'utf8');
    const changed = await json(
      'story',
      'overlay',
      'add',
      'story-overlay.loopweft',
      'S1.1',
      'caption',
      '--overlay',
      '{"type":"legend"}',
    );
    expect(changed.code).toBe(2);
    expect((changed.doc.error as { message: string }).message).toBe(
      '--overlay gives type "legend", but the type argument is caption; leave type out of --overlay.',
    );
    expect(readFileSync(join(dir, 'story-overlay.loopweft'), 'utf8')).toBe(before);
    const repeated = await json(
      'story',
      'overlay',
      'add',
      'story-overlay.loopweft',
      'S1.1',
      'legend',
      '--overlay',
      '{"type":"legend","place":"bottom-left"}',
    );
    expect(repeated.code).toBe(0);
    expect(saved('story-overlay.loopweft').story.scenes[0]?.steps[0]).toMatchObject({
      overlays: [{ type: 'legend', place: 'bottom-left' }],
    });
  });
});

describe('story show', () => {
  /** A new project: links A → B → C, a source (test2020), and scene S1 ("One") with step S1.1 ("First"). */
  async function showProject(file: string) {
    await run('new', file, '--title', 'Show');
    await run('add', file, '--shorthand', 'A -> B (+)\\nB -> C (-)');
    await run(
      'source',
      'add',
      file,
      '--apa',
      'Test, A. (2020). *A fictitious source for tests*. Test Press.',
    );
    await run('story', 'scene', 'add', file, '--title', 'One');
    await run('story', 'step', 'add', file, 'S1', '--label', 'First');
  }

  it('shows every overlay in full, in words: lines, cards, captions, credits and the pages cited', async () => {
    const file = 'show-overlays.loopweft';
    await showProject(file);
    await run('story', 'step', 'set', file, 'S1.1', '--up', 'a', '--down', 'b', '--mixed', 'c');
    writeFileSync(
      join(dir, 'figure.png'),
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64',
      ),
    );
    await run('story', 'image', 'add', file, 'figure.png');
    const adds: string[][] = [
      [
        'title',
        '--title',
        'Big title',
        '--subtitle',
        'A subtitle',
        '--line',
        'Line one',
        '--line',
        'Line two',
      ],
      [
        'cards',
        '--title',
        'Ways',
        '--card',
        'First | the first one | domino',
        '--card',
        'Second',
        '--active',
        '0',
        '--place',
        'right',
        '--cite',
        'test2020:4–5',
      ],
      [
        'image',
        '--image',
        'figure',
        '--alt',
        'A test figure',
        '--caption',
        'Fig. 1',
        '--credit',
        'Test data',
        '--cite',
        'test2020:7',
      ],
      [
        'statement',
        '--kicker',
        'QUESTION',
        '--line',
        'Why now?',
        '--style',
        'question',
        '--cite',
        'test2020',
      ],
    ];
    for (const add of adds) expect((await run('story', 'overlay', 'add', file, 'S1.1', ...add)).code).toBe(0);
    const shown = await run('story', 'show', file, 'S1.1');
    expect(shown.out).toContain(
      [
        'Overlays (counted from 0, later ones on top):',
        '  0 title page "Big title" · subtitle "A subtitle" · lines "Line one" / "Line two"',
        '  1 cards "Ways" · place right · cites test2020 pp. 4–5',
        '    card 0 "First" (highlighted) · sub "the first one" · icon domino',
        '    card 1 "Second"',
        '  2 image figure · alt "A test figure" · caption "Fig. 1" · credit "Test data" · cites test2020 p. 7',
        '  3 statement (question) · kicker "QUESTION" · lines "Why now?" · cites test2020',
      ].join('\n'),
    );
    // Each trend in words beside its mark, for screen readers and fonts without the marks.
    expect(shown.out).toContain('  trends: a ▲ rising, b ▼ falling, c ± pushed both ways\n');
  });

  it("lists a step's timing warnings with its other warnings", async () => {
    const file = 'show-timing.loopweft';
    await showProject(file);
    await run('story', 'scene', 'set', file, 'S1', '--target', '10');
    await run('story', 'step', 'set', file, 'S1.1', '--at', '30');
    await run('story', 'step', 'add', file, 'S1', '--label', 'Second', '--at', '5');
    const first = await json('story', 'show', file, 'S1.1');
    expect((first.doc.warnings as { code: string }[]).map((w) => w.code)).toContain('stepPastTarget');
    const second = await run('story', 'show', file, 'S1.2');
    expect(second.out).toContain('Warnings:\n  Step S1.2 is due at 5 s, before step S1.1 (30 s).\n');
    expect((await json('story', 'show', file, 'S1.2')).doc.warnings).toEqual([
      expect.objectContaining({ code: 'stepTimeOrder', path: ['story', 'scenes', 0, 'steps', 1, 'at'] }),
    ]);
  });

  it('shows a scene whose title has a dot in it, and keeps a step key a step', async () => {
    const file = 'show-dots.loopweft';
    await showProject(file);
    await run('story', 'step', 'add', file, 'S1', '--label', 'Second');
    await run('story', 'scene', 'add', file, '--title', 'Version 1.0');
    const scene = await run('story', 'show', file, 'Version 1.0');
    expect(scene.code).toBe(0);
    expect(scene.out).toMatch(/^S2 "Version 1\.0": scene 2 of 2\n/);
    // A scene titled like a step's key: the key names the step.
    await run('story', 'scene', 'add', file, '--title', 'S1.2');
    expect((await run('story', 'show', file, 'S1.2')).out).toMatch(/^S1\.2 "Second": step 2 of 2/);
    // A title that names a step another way too ("One" is S1's title) is refused, not guessed.
    await run('story', 'scene', 'add', file, '--title', 'One.1');
    const both = await json('story', 'show', file, 'One.1');
    expect(both.code).toBe(2);
    expect((both.doc.error as { message: string }).message).toBe(
      '"One.1" is the title of scene S4 and also names step S1.1; use S4 or S1.1.',
    );
    expect((await json('story', 'show', file, 'Version 2.0')).doc.error).toMatchObject({
      message: expect.stringMatching(/^No scene "Version 2\.0"/),
    });
    expect((await json('story', 'show', file, 'S1.9')).doc.error).toMatchObject({
      message: expect.stringMatching(/^No step "9" in scene S1/),
    });
  });
});

describe('story show, when a reference names several steps', () => {
  it('refuses a scene title that also names several steps', async () => {
    const file = 'show-many.loopweft';
    await run('new', file, '--title', 'Many');
    await run('story', 'scene', 'add', file, '--title', 'One');
    await run('story', 'step', 'add', file, 'S1', '--label', 'x');
    await run('story', 'step', 'add', file, 'S1', '--label', 'x');
    await run('story', 'scene', 'add', file, '--title', 'One.x');
    const both = await json('story', 'show', file, 'One.x');
    expect(both.code).toBe(2);
    expect((both.doc.error as { message: string }).message).toBe(
      '"One.x" is the title of scene S2 and also names steps S1.1 and S1.2; use S2, S1.1 or S1.2.',
    );
  });

  it('refuses a title several scenes share that also names a step, unless by its key', async () => {
    const file = 'show-titles.loopweft';
    await run('new', file, '--title', 'Titles');
    await run('story', 'scene', 'add', file, '--title', 'One');
    await run('story', 'step', 'add', file, 'S1', '--label', 'x');
    await run('story', 'scene', 'add', file, '--title', 'One.x');
    await run('story', 'scene', 'add', file, '--title', 'One.x');
    const shared = await json('story', 'show', file, 'One.x');
    expect(shared.code).toBe(2);
    expect((shared.doc.error as { message: string }).message).toBe(
      '"One.x" is the title of 2 scenes (S2, S3); use the id of the one you mean. It also names step S1.1.',
    );
    expect((await json('story', 'show', file, 'S1.1')).code).toBe(0);
  });

  it('names the steps a reference could mean when scenes share the title before its dot', async () => {
    const file = 'show-shared.loopweft';
    await run('new', file, '--title', 'Shared');
    for (const scene of ['S1', 'S2']) {
      await run('story', 'scene', 'add', file, '--title', 'One');
      await run('story', 'step', 'add', file, scene, '--label', 'x');
    }
    const shared = await json('story', 'show', file, 'One.x');
    expect(shared.code).toBe(2);
    expect((shared.doc.error as { message: string }).message).toBe(
      '"One.x" names steps S1.1 and S2.1; use S1.1 or S2.1.',
    );
  });
});

describe('placing scenes and steps', () => {
  /** A new project: scene S1 ("One") with step S1.1 ("b"), and scene S2 ("Two") with step S2.1 ("x"). */
  async function twoScenes(file: string) {
    await run('new', file, '--title', 'Place');
    await run('story', 'scene', 'add', file, '--title', 'One');
    await run('story', 'scene', 'add', file, '--title', 'Two');
    await run('story', 'step', 'add', file, 'One', '--label', 'b');
    await run('story', 'step', 'add', file, 'Two', '--label', 'x');
  }
  /** The labels of a scene's steps (the scene by its place in the story), in order. */
  const labels = (file: string, scene: number) => saved(file).story.scenes[scene]?.steps.map((s) => s.label);

  it('takes a step by its key, or by its id or label in the scene it goes to, and a scene by its title', async () => {
    const file = 'place-forms.loopweft';
    await twoScenes(file);
    // A scene placed before another named by its title; it is S3, the next free id.
    expect((await run('story', 'scene', 'add', file, '--title', 'Zero', '--before', 'One')).code).toBe(0);
    expect(saved(file).story.scenes.map((s) => s.title)).toEqual(['Zero', 'One', 'Two']);
    expect((await run('story', 'step', 'add', file, 'One', '--label', 'a', '--before', 'S1.1')).code).toBe(0);
    expect((await run('story', 'step', 'add', file, 'One', '--label', 'c', '--after', 'b')).code).toBe(0);
    expect(labels(file, 1)).toEqual(['a', 'b', 'c']);
    expect((await run('story', 'step', 'move', file, 'S1.3', '--before', '1')).code).toBe(0);
    expect(labels(file, 1)).toEqual(['a', 'c', 'b']);
    expect((await run('story', 'step', 'copy', file, 'S1.2', '--label', 'a2', '--after', 'S1.2')).code).toBe(
      0,
    );
    expect(labels(file, 1)).toEqual(['a', 'a2', 'c', 'b']);
    // Into another scene, beside a step of that scene.
    const moved = await run('story', 'step', 'move', file, 'S1.2', '--scene', 'Two', '--before', 'S2.1');
    expect(moved.code).toBe(0);
    expect(labels(file, 2)).toEqual(['a', 'x']);
  });

  it('refuses a step of another scene to place beside, changing nothing', async () => {
    const file = 'place-foreign.loopweft';
    await twoScenes(file);
    const before = readFileSync(join(dir, file), 'utf8');
    const out = await json('story', 'step', 'add', file, 'One', '--label', 'd', '--before', 'S2.1');
    expect(out.code).toBe(2);
    expect((out.doc.error as { message: string }).message).toBe(
      'Step S2.1 is in scene S2; name a step of scene S1, where it goes.',
    );
    expect((await json('story', 'step', 'move', file, 'S1.1', '--after', 'S1.9')).code).toBe(2);
    expect(readFileSync(join(dir, file), 'utf8')).toBe(before);
  });

  it('refuses a label with dots that another reading names too in the scene it goes to', async () => {
    const file = 'place-many.loopweft';
    await run('new', file, '--title', 'Many');
    await run('story', 'scene', 'add', file, '--title', 'One');
    await run('story', 'scene', 'add', file, '--title', 'One.foo');
    await run('story', 'step', 'add', file, 'S1', '--label', 'One.foo.bar');
    await run('story', 'step', 'add', file, 'S1', '--label', 'foo.bar');
    await run('story', 'step', 'add', file, 'S2', '--label', 'bar');
    const before = readFileSync(join(dir, file), 'utf8');
    // "One.foo.bar": S1.1 by its label, S1.2 as scene "One", step "foo.bar", and S2.1 as scene "One.foo", step
    // "bar". Two of them are in the scene the step goes to: refused.
    const out = await json('story', 'step', 'add', file, 'S1', '--label', 'New', '--before', 'One.foo.bar');
    expect(out.code).toBe(2);
    expect((out.doc.error as { message: string }).message).toBe(
      '"One.foo.bar" is the label of step S1.1 and also names step S1.2; use S1.1 or S1.2.',
    );
    expect(readFileSync(join(dir, file), 'utf8')).toBe(before);
  });

  it('reads a label with dots in the scene it goes to, and refuses one that also names another step', async () => {
    const file = 'place-dots.loopweft';
    await twoScenes(file);
    // "One.1" is the label of S1.2, and also step 1 of scene "One" (S1.1): refused, nothing saved.
    await run('story', 'step', 'add', file, 'One', '--label', 'One.1');
    const before = readFileSync(join(dir, file), 'utf8');
    const both = await json('story', 'step', 'add', file, 'One', '--label', 'New', '--before', 'One.1');
    expect(both.code).toBe(2);
    expect((both.doc.error as { message: string }).message).toBe(
      '"One.1" is the label of step S1.2 and also names step S1.1; use S1.2 or S1.1.',
    );
    expect(readFileSync(join(dir, file), 'utf8')).toBe(before);
    expect((await run('story', 'step', 'add', file, 'One', '--label', 'New', '--before', 'S1.2')).code).toBe(
      0,
    );
    expect(labels(file, 0)).toEqual(['b', 'New', 'One.1']);
    // A label with dots that names no other step.
    await run('story', 'step', 'add', file, 'One', '--label', 'Part 2.b');
    const placed = await run(
      'story',
      'step',
      'add',
      file,
      'One',
      '--label',
      'Just before',
      '--before',
      'Part 2.b',
    );
    expect(placed.code).toBe(0);
    expect(labels(file, 0)).toEqual(['b', 'New', 'One.1', 'Just before', 'Part 2.b']);
    // "Two.1" is a label here and step 1 of scene "Two" there, which cannot be placed beside: the label is meant.
    await run('story', 'step', 'add', file, 'One', '--label', 'Two.1', '--first');
    expect((await run('story', 'step', 'move', file, 'S1.3', '--after', 'Two.1')).code).toBe(0);
    expect(labels(file, 0)).toEqual(['Two.1', 'New', 'b', 'One.1', 'Just before', 'Part 2.b']);
  });
});

describe('export', () => {
  copyFileSync(
    fileURLToPath(new URL('../../../examples/polycrisis.loopweft', import.meta.url)),
    join(dir, 'talk.loopweft'),
  );

  it('writes the project as one HTML file, the same bytes each time, and says what is in it', async () => {
    const { code, out } = await run('export', 'talk.loopweft', '--html');
    expect(code).toBe(0);
    expect(out).toMatch(
      /^Wrote talk\.html \(1\.\d MB\): 11 scenes, 70 steps, 14 sources; speaker notes included\.\n$/,
    );
    const first = readFileSync(join(dir, 'talk.html'), 'utf8');
    expect(first).toContain('data-notes="included"');
    expect((await run('export', 'talk.loopweft', '--html', '-o', 'again.html')).code).toBe(0);
    expect(readFileSync(join(dir, 'again.html'), 'utf8')).toBe(first);
  });

  it('leaves the notes out on request, and reports in JSON', async () => {
    const { code, doc } = await json(
      'export',
      'talk.loopweft',
      '--html',
      '--no-notes',
      '-o',
      'audience.html',
    );
    expect(code).toBe(0);
    expect(doc).toMatchObject({ ok: true, format: 'html', notes: false, fontsLeftOut: [], warnings: [] });
    expect(doc.images).toEqual([{ id: 'richards_2021_fig5', type: 'image/webp', bytes: 204394 }]);
    expect(readFileSync(join(dir, 'audience.html'), 'utf8')).toContain('data-notes="left-out"');
  });

  it('asks for the format, and never replaces a file unless told to', async () => {
    expect((await run('export', 'talk.loopweft')).code).toBe(2);
    const again = await run('export', 'talk.loopweft', '--html');
    expect(again.code).toBe(2);
    expect(again.err).toContain('talk.html already exists; choose another name, or replace it with --force.');
    expect((await run('export', 'talk.loopweft', '--html', '--force')).code).toBe(0);
  });

  it('never writes over the project, under another spelling or through a link, even with --force', async () => {
    const source = join(dir, 'talk.loopweft');
    const before = readFileSync(source, 'utf8');
    const direct = async (...args: string[]) => {
      let err = '';
      const code = await main(args, { out: () => {}, err: (t) => (err += t) }, env);
      return { code, err };
    };
    const aliases = [`${dir}${sep}.${sep}talk.loopweft`];
    try {
      linkSync(source, join(dir, 'hard-link.loopweft'));
      aliases.push(join(dir, 'hard-link.loopweft'));
    } catch (error) {
      // A drive without hard links (FAT, some network shares), as each system says so; anything else is a
      // failure of the test's own.
      if (!NO_HARD_LINKS.includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
    }
    try {
      symlinkSync(source, join(dir, 'soft-link.loopweft'));
      aliases.push(join(dir, 'soft-link.loopweft'));
    } catch {
      // Windows lets only some accounts make symbolic links.
    }
    for (const alias of aliases) {
      const { code, err } = await direct('export', source, '--html', '--force', '-o', alias);
      expect(code, alias).toBe(2);
      expect(err).toContain('The HTML file would replace the project');
    }
    expect(readFileSync(source, 'utf8')).toBe(before);
  });

  it('lets only one of two exports at once make a new file, and keeps that file whole', async () => {
    expect((await run('export', 'talk.loopweft', '--html', '-o', 'reference.html')).code).toBe(0);
    const both = await Promise.all([
      run('export', 'talk.loopweft', '--html', '-o', 'race.html'),
      run('export', 'talk.loopweft', '--html', '-o', 'race.html'),
    ]);
    expect(both.map((r) => r.code).sort()).toEqual([0, 2]);
    expect(both.find((r) => r.code === 2)?.err).toContain('race.html already exists');
    expect(readFileSync(join(dir, 'race.html'), 'utf8')).toBe(
      readFileSync(join(dir, 'reference.html'), 'utf8'),
    );
    expect(leftovers()).toEqual([]);
  });

  it('gives each export a temporary folder of its own, even two at once in threads of one process', async () => {
    // Threads of one process share its id, so a name made of the id and a count can be taken already: by
    // another thread's export, or by a process with the same id that was stopped part way. One is there.
    const stale = join(dir, `threads.html.tmp-${process.pid}-1`);
    writeFileSync(stale, 'not an export');
    expect((await run('export', 'talk.loopweft', '--html', '-o', 'reference.html', '--force')).code).toBe(0);
    const both = await Promise.all([inThread('threads.html'), inThread('threads.html')]);
    expect(both.map((r) => r.code).sort()).toEqual([0, 2]);
    expect(both.find((r) => r.code === 2)?.err).toContain('threads.html already exists');
    expect(readFileSync(join(dir, 'threads.html'), 'utf8')).toBe(
      readFileSync(join(dir, 'reference.html'), 'utf8'),
    );
    expect(readFileSync(stale, 'utf8')).toBe('not an export');
    rmSync(stale);
    expect(leftovers()).toEqual([]);
  }, 120_000);
});

/** How systems say a drive has no hard links (Windows names a FAT drive's refusal EISDIR). */
const NO_HARD_LINKS = ['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV', 'EISDIR'];

/** What an export could leave in the folder: its temporary folder. */
const leftovers = () => readdirSync(dir).filter((f) => f.startsWith('.loopweft-export-'));

/** The command line's main, as another thread of this process loads it (Node runs the source itself). */
const MAIN = new URL('../src/main.ts', import.meta.url).href;
const THREAD = `
import { parentPort, workerData } from 'node:worker_threads';
const { main } = await import(workerData.main);
let err = '';
const code = await main(workerData.args, { out: () => {}, err: (t) => (err += t) }, { today: '2026-10-18' });
parentPort.postMessage({ code, err });
`;

/** Exports the example in a new thread of this process, as `out` in the temporary folder. */
function inThread(out: string): Promise<{ code: number; err: string }> {
  const args = ['export', join(dir, 'talk.loopweft'), '--html', '-o', join(dir, out)];
  return new Promise((done, fail) => {
    const thread = new Worker(new URL(`data:text/javascript,${encodeURIComponent(THREAD)}`), {
      workerData: { main: MAIN, args },
    });
    thread.once('message', done);
    thread.once('error', fail);
  });
}

describe('meta and theme', () => {
  it('show and change what a project says about itself, and how it looks', async () => {
    await run('new', 'meta.loopweft', '--template', 'fixes-that-fail', '--title', 'Antibiotics');
    const shown = await json('meta', 'meta.loopweft');
    expect(shown.code).toBe(0);
    expect((shown.doc.meta as { title: string }).title).toBe('Antibiotics');

    expect(
      (await run('meta', 'meta.loopweft', '--description', 'A sketch.', '--author', 'A. Student')).code,
    ).toBe(0);
    expect(saved('meta.loopweft').meta).toMatchObject({ description: 'A sketch.', author: 'A. Student' });
    expect((await run('meta', 'meta.loopweft', '--clear', 'author')).code).toBe(0);
    expect(saved('meta.loopweft').meta.author).toBeUndefined();
    expect((await json('meta', 'meta.loopweft', '--clear', 'title')).code).toBe(2);
    expect((await json('meta', 'meta.loopweft', '--title', '')).code).toBe(1);

    expect((await run('theme', 'meta.loopweft', '--base', 'light', '--palette', 'okabe-ito')).code).toBe(0);
    expect(saved('meta.loopweft').theme).toMatchObject({ base: 'light', palette: 'okabe-ito' });
    expect((await json('theme', 'meta.loopweft', '--base', 'sepia')).code).toBe(2);
    expect((await json('theme', 'meta.loopweft', '--palette', 'rainbow')).code).toBe(1);
    expect((await run('theme', 'meta.loopweft', '--clear', 'base', 'palette')).code).toBe(0);
    expect(saved('meta.loopweft').theme.base).toBe('cinematic-dark');
    expect(saved('meta.loopweft').theme.palette).toBeUndefined();
    const theme = await run('theme', 'meta.loopweft');
    expect(theme.out).toContain('loopweft (the default)');
  });
});

describe('what the agent dry run found', () => {
  it('helps with a command at any depth: help story step set', async () => {
    const { code, out } = await run('help', 'story', 'step', 'set');
    expect(code).toBe(0);
    expect(out).toMatch(/^Usage: loopweft story step set \[options\] <file> <step>/);
  });

  it('refuses an option that takes one value given twice, rather than keep the last alone', async () => {
    await run('new', 'twice.loopweft', '--template', 'fixes-that-fail');
    await run('story', 'scene', 'add', 'twice.loopweft', '--title', 'One');
    const { code, doc } = await json(
      'story',
      'step',
      'add',
      'twice.loopweft',
      'S1',
      '--label',
      'Up',
      '--up',
      'fix',
      '--up',
      'problem_symptom',
    );
    expect(code).toBe(2);
    expect((doc.error as { message: string }).message).toBe(
      '--up is given more than once, and only one counts: give it once (a list goes in one, comma-separated, e.g. --up a,b).',
    );
    // Options that collect may repeat.
    await run('story', 'step', 'add', 'twice.loopweft', 'S1', '--label', 'Two');
    expect(
      (await run('story', 'step', 'set', 'twice.loopweft', 'S1.1', '--pulse', 'L1', '--pulse', 'L3')).code,
    ).toBe(0);
    expect(
      (
        await run(
          'story',
          'step',
          'add',
          'twice.loopweft',
          'S1',
          '--label',
          'Up',
          '--up',
          'fix,problem_symptom',
        )
      ).code,
    ).toBe(0);
  });

  it('says what a step id is when given a key (S1.1)', async () => {
    await run('new', 'ids.loopweft', '--template', 'fixes-that-fail');
    await run('story', 'scene', 'add', 'ids.loopweft', '--title', 'One');
    const { code, err } = await run(
      'story',
      'step',
      'add',
      'ids.loopweft',
      'S1',
      '--id',
      'S1.1',
      '--label',
      'A',
    );
    expect(code).toBe(2);
    expect(err).toContain('Leave --id out and the step is numbered for you');
  });

  it('puts a variable into a named loop: link set --cascade takes the name off, loops add names it again', async () => {
    await run('new', 'insert.loopweft', '--template', 'fixes-that-fail');
    await run('var', 'add', 'insert.loopweft', '--label', 'Car trips');
    const refused = await run('link', 'set', 'insert.loopweft', 'L4', '--from', 'Car trips');
    expect(refused.code).toBe(2);
    expect(refused.err).toContain('Changing L4 breaks 1 named loop through it (R2)');
    const changed = await run('link', 'set', 'insert.loopweft', 'L4', '--from', 'Car trips', '--cascade');
    expect(changed.code).toBe(0);
    expect(changed.out).toContain('took the name off 1 loop it broke (R2)');
    await run(
      'link',
      'add',
      'insert.loopweft',
      '--from',
      'unintended_consequence',
      '--to',
      'Car trips',
      '--sign',
      '+',
    );
    const named = await run(
      'loops',
      'add',
      'insert.loopweft',
      '--links',
      'L3,L5,L4,L1',
      '--id',
      'R2',
      '--name',
      'Back again',
    );
    expect(named.code).toBe(0);
    expect(saved('insert.loopweft').loops.map((l) => l.id)).toEqual(['B1', 'R2']);
  });
});
