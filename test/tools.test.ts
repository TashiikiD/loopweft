import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { main } from '../packages/cli/src/main.ts';
import { checkNamedMap } from '../tools/dry-run-map.ts';
import { serve } from '../tools/serve.ts';

/** A 1 × 1 PNG and a 1 × 1 GIF, whole. */
const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const TINY_GIF = 'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const quiet = { out: () => {}, err: () => {} };

const dir = mkdtempSync(join(tmpdir(), 'loopweft-serve-'));
mkdirSync(join(dir, 'site', 'demo'), { recursive: true });
writeFileSync(join(dir, 'site', 'demo', 'index.html'), '<!doctype html><title>Demo</title>');
writeFileSync(join(dir, 'site', 'app.js'), 'export {};');
writeFileSync(join(dir, 'secret.txt'), 'outside the served folder');
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('the review server', () => {
  it('serves files of its folder, with their types, and index.html for a folder', async () => {
    const served = await serve(join(dir, 'site'));
    try {
      expect(served.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      const page = await fetch(`${served.url}/demo/?capture=1`);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain('<title>Demo</title>');
      const script = await fetch(`${served.url}/app.js`);
      expect(script.headers.get('content-type')).toContain('text/javascript');
      expect((await fetch(`${served.url}/missing.png`)).status).toBe(404);
    } finally {
      await served.close();
    }
  });

  it('never serves anything outside its folder', async () => {
    const served = await serve(join(dir, 'site'));
    try {
      for (const path of ['/../secret.txt', '/%2e%2e/secret.txt', '/demo/..%2f..%2fsecret.txt']) {
        const res = await fetch(`${served.url}${path}`);
        expect([403, 404], path).toContain(res.status);
        expect(await res.text()).not.toContain('outside the served folder');
      }
    } finally {
      await served.close();
    }
  });
});

describe('the agent dry run’s check of the map', () => {
  it('validates the map it named, and only that one', async () => {
    const work = join(dir, 'dry-run');
    mkdirSync(work, { recursive: true });
    // Another map than the one named: not made, and the other is named, not validated in its place.
    expect(await main(['new', join(work, 'other.loopweft'), '--title', 'Other'], quiet)).toBe(0);
    const missing = await checkNamedMap(work, 'food-strand.loopweft');
    expect(missing).toMatchObject({ found: false, valid: false, others: ['other.loopweft'] });
    expect(missing.text).toBe(
      'The named map, food-strand.loopweft, was not made. Other maps in the folder, not checked: other.loopweft.\n',
    );
    // The named map, made and valid.
    expect(await main(['new', join(work, 'food-strand.loopweft'), '--title', 'Food'], quiet)).toBe(0);
    expect(await checkNamedMap(work, 'food-strand.loopweft')).toMatchObject({ found: true, valid: true });
    // The named map, made but not a map.
    writeFileSync(join(work, 'broken.loopweft'), '{ "not": "a map" }');
    expect(await checkNamedMap(work, 'broken.loopweft')).toMatchObject({ found: true, valid: false });
  });
});

describe('the export checker', () => {
  /** Runs `node tools/check-exports.ts <folder>`: its exit code and its report's rows, by file. */
  const check = (folder: string) => {
    const run = spawnSync(process.execPath, [join('tools', 'check-exports.ts'), folder], {
      encoding: 'utf8',
      timeout: 150_000,
    });
    const rows: Record<string, { ok: boolean; what: string }> = Object.fromEntries(
      run.stdout
        .split('\n')
        .filter((l) => l.startsWith('| ') && !l.startsWith('| File') && !l.startsWith('|---'))
        .map((l) => {
          const [file, verdict, what] = l.slice(2, -2).split(' | ');
          return [file, { ok: verdict === 'ok', what }];
        }),
    );
    return { code: run.status, rows };
  };
  const folder = (name: string, files: Record<string, Buffer | string>) => {
    const at = join(dir, name);
    mkdirSync(at, { recursive: true });
    for (const [file, bytes] of Object.entries(files)) writeFileSync(join(at, file), bytes);
    return at;
  };
  const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><rect width="5" height="5"/><text>A</text></svg>';

  it('passes good exports, each decoded or parsed, and skips what is not an export', async () => {
    const good = folder('good', {
      'a.png': Buffer.from(TINY_PNG, 'base64'),
      'b.gif': Buffer.from(TINY_GIF, 'base64'),
      'c.svg': SVG,
      'notes.txt': 'not an export',
    });
    expect(await main(['new', join(good, 'd.loopweft'), '--title', 'Good'], quiet)).toBe(0);
    const { code, rows } = check(good);
    expect(rows).toEqual({
      'a.png': { ok: true, what: 'PNG 1 × 1, decoded (0 KB)' },
      'b.gif': { ok: true, what: 'GIF 1 × 1, 1 frames, each decoded (0 KB)' },
      'c.svg': { ok: true, what: 'SVG, viewBox 0 0 20 10: 1 texts, 1 shapes (0 KB)' },
      'd.loopweft': { ok: true, what: expect.stringMatching(/^valid: 0 errors, \d+ warnings/) },
      'notes.txt': { ok: true, what: 'not an export (skipped)' },
    });
    expect(code).toBe(0);
  }, 180_000);

  it('fails broken exports, cut short or malformed, without hanging on a broken video', async () => {
    // A PNG's signature and IHDR's start, with a width and height, but nothing to decode.
    const png = Buffer.concat([
      PNG_SIGNATURE,
      Buffer.from([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 9, 0, 0, 0, 9]),
    ]);
    // GIF89a, a size, flags and an image separator, then nothing.
    const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0, 0, 0x2c]);
    const bad = folder('bad', {
      'cut.png': png,
      'cut.gif': gif,
      'malformed.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect>',
      'comment.svg': '<!-- <svg viewBox="0 0 1 1"> --><html xmlns="http://www.w3.org/1999/xhtml"/>',
      'broken.webm': Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(64, 7)]),
    });
    const { code, rows } = check(bad);
    expect(code).toBe(1);
    expect(Object.keys(rows).sort()).toEqual([
      'broken.webm',
      'comment.svg',
      'cut.gif',
      'cut.png',
      'malformed.svg',
    ]);
    for (const [file, row] of Object.entries(rows)) expect(row.ok, `${file}: ${row.what}`).toBe(false);
    expect(rows['cut.gif']?.what).toMatch(/cut short/);
    expect(rows['malformed.svg']?.what).toMatch(/not well-formed XML/);
    expect(rows['comment.svg']?.what).toMatch(/not an SVG/);
  }, 180_000);

  it('fails a folder with no export in it', () => {
    const sets: Record<string, string>[] = [{}, { 'readme.txt': 'nothing to check' }];
    for (const files of sets) {
      const { code, rows } = check(folder(`none-${Object.keys(files).length}`, files));
      expect(code).toBe(1);
      expect(rows['(the folder)']).toEqual({ ok: false, what: 'no export to check in it' });
    }
  }, 180_000);

  it('passes a real one-file HTML, and fails one that loads a file beside it or only looks like one', async () => {
    const at = folder('beside', { 'beside.png': Buffer.from(TINY_PNG, 'base64') });
    const map = join(at, 'map.loopweft');
    expect(await main(['new', map, '--title', 'Beside'], quiet)).toBe(0);
    expect(await main(['export', map, '--html', '-o', join(at, 'alone.html')], quiet)).toBe(0);
    rmSync(map);
    const real = readFileSync(join(at, 'alone.html'), 'utf8');
    // The same presentation, also showing a picture from the folder: it draws while the picture is there, and
    // would miss it once sent alone.
    writeFileSync(join(at, 'needs.html'), real.replace('</body>', '<img src="beside.png"></body>'));
    // A page with the start page's and the stage's classes, but no project, player or map.
    writeFileSync(
      join(at, 'looks.html'),
      '<!doctype html><title>T</title><div class="lp-start">Start</div><div class="lw-stage">Stage</div>',
    );
    // A real presentation whose project is not one.
    writeFileSync(
      join(at, 'invalid.html'),
      real.replace(
        /(<script type="application\/json" id="loopweft-project"[^>]*>)[\s\S]*?(<\/script>)/,
        '$1{"not":"a map"}$2',
      ),
    );
    const { code, rows } = check(at);
    expect(code).toBe(1);
    expect(rows['alone.html']?.ok, rows['alone.html']?.what).toBe(true);
    expect(rows['beside.png']?.ok).toBe(true);
    expect(rows['needs.html']?.ok).toBe(false);
    expect(rows['needs.html']?.what).toMatch(/needs 1 file\(s\) beside it, e\.g\. beside\.png/);
    expect(rows['looks.html']?.ok).toBe(false);
    expect(rows['looks.html']?.what).toMatch(/no project in it; .*no stage drawn/);
    expect(rows['invalid.html']?.ok).toBe(false);
    expect(rows['invalid.html']?.what).toMatch(/its project is not valid/);
  }, 180_000);

  it('fails a GIF with a frame that does not decode, though its blocks and first frame are whole', () => {
    // The 1 × 1 GIF's screen and colours, then its one frame (a descriptor and LZW data), twice; in the broken
    // one, the second frame's data is replaced by bytes no decoder can read.
    const tiny = Buffer.from(TINY_GIF, 'base64');
    const head = tiny.subarray(0, 19);
    const frame = tiny.subarray(19, tiny.length - 1);
    const broken = Buffer.from(frame);
    broken[broken.length - 2] = 0xff;
    const { code, rows } = check(
      folder('frames', {
        'two.gif': Buffer.concat([head, frame, frame, Buffer.from([0x3b])]),
        'second-broken.gif': Buffer.concat([head, frame, broken, Buffer.from([0x3b])]),
      }),
    );
    expect(code).toBe(1);
    expect(rows['two.gif']).toEqual({ ok: true, what: 'GIF 1 × 1, 2 frames, each decoded (0 KB)' });
    expect(rows['second-broken.gif']?.ok).toBe(false);
    expect(rows['second-broken.gif']?.what).toMatch(/frame 2|reads 1 frames/);
  }, 180_000);

  // A name with a pipe in it, which Windows does not allow.
  it.skipIf(process.platform === 'win32')(
    'keeps a file’s name in its cell, whatever it holds',
    () => {
      const run = spawnSync(
        process.execPath,
        [join('tools', 'check-exports.ts'), folder('names', { 'map|draft.svg': SVG, 'b.svg': SVG })],
        { encoding: 'utf8', timeout: 150_000 },
      );
      const lines = run.stdout.split('\n').filter((l) => l.startsWith('|'));
      // The header, its rule and one row a file, each of three cells (four pipes not escaped).
      expect(lines).toHaveLength(4);
      for (const l of lines) expect(l.split(/(?<!\\)\|/)).toHaveLength(5);
      expect(lines.some((l) => l.startsWith('| map\\|draft.svg | ok |'))).toBe(true);
    },
    180_000,
  );

  it('checks a good video after a broken one as if it came first', async () => {
    const videos = folder('videos', {
      'a-broken.webm': Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(64, 7)]),
    });
    expect(
      await main(
        [
          'export',
          join('examples', 'polycrisis.loopweft'),
          '--webm',
          '--from',
          'S00.1',
          '--to',
          'S00.1',
          '--height',
          '720',
          '--hold',
          '0',
          '-o',
          join(videos, 'b-good.webm'),
        ],
        quiet,
      ),
    ).toBe(0);
    const { code, rows } = check(videos);
    expect(code).toBe(1);
    expect(rows['a-broken.webm']?.ok).toBe(false);
    expect(rows['b-good.webm']).toEqual({
      ok: true,
      what: expect.stringMatching(/^WEBM 1280 × 720, \d+\.\d s, plays in Chrome/),
    });
  }, 240_000);

  // A folder no one may read: by its permissions where they are honoured (not on Windows, nor for root).
  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'reports a folder it cannot read, and checks the rest',
    () => {
      const at = folder('locked-parent', { 'z.png': Buffer.from(TINY_PNG, 'base64') });
      const locked = join(at, 'locked');
      mkdirSync(locked);
      writeFileSync(join(locked, 'inside.png'), Buffer.from(TINY_PNG, 'base64'));
      chmodSync(locked, 0o000);
      try {
        const { code, rows } = check(at);
        expect(code).toBe(1);
        expect(rows['locked/']?.ok).toBe(false);
        expect(rows['locked/']?.what).toMatch(/^a folder that could not be read: /);
        expect(rows['z.png']?.ok).toBe(true);
      } finally {
        chmodSync(locked, 0o755);
      }
    },
    180_000,
  );
});
