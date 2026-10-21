// `loopweft export --pdf notes|references`: the documents written beside the project (no browser needed), on
// Letter or A4, never over anything without --force, and every mistake in the options named.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { afterAll, describe, expect, it } from 'vitest';
import { main } from '../src/main.ts';

const dir = mkdtempSync(join(tmpdir(), 'loopweft-pdf-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const project = join(dir, 'talk.loopweft');
writeFileSync(project, readFileSync(new URL('../../../examples/polycrisis.loopweft', import.meta.url)));

async function run(...args: string[]) {
  let out = '';
  let err = '';
  const code = await main(args, { out: (t) => (out += t), err: (t) => (err += t) });
  return { code, out, err };
}

describe('loopweft export --pdf', () => {
  it('writes the speaker notes on Letter, and says how many pages', async () => {
    const result = await run('export', project, '--pdf', 'notes');
    expect(result.code).toBe(0);
    expect(result.out).toBe(
      `Wrote ${join(dir, 'talk-speaker-notes.pdf')} (speaker notes: 18 pages, Letter, 0.2 MB).\n`,
    );
    const doc = await PDFDocument.load(readFileSync(join(dir, 'talk-speaker-notes.pdf')));
    expect(doc.getPageCount()).toBe(18);
    expect(doc.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    // Never over a file without --force.
    const again = await run('export', project, '--pdf', 'notes');
    expect(again.code).toBe(2);
    expect(again.err).toContain('already exists');
    expect((await run('export', project, '--pdf', 'notes', '--force')).code).toBe(0);
  });

  it('writes the references on A4, and reports as JSON', async () => {
    const out = join(dir, 'refs.pdf');
    const result = await run('export', project, '--pdf', 'references', '--paper', 'a4', '-o', out, '--json');
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out)).toEqual({
      ok: true,
      file: project,
      out,
      format: 'pdf',
      document: 'references',
      paper: 'a4',
      pages: 3,
      bytes: readFileSync(out).length,
      notes: [],
    });
  });

  it.each([
    [
      ['--pdf', 'posters'],
      '--pdf is slides (one page per step), notes (the speaker notes) or references, not "posters".',
    ],
    [
      ['--pdf', 'slides', '--paper', 'a4'],
      'The slides are 16:9 pages, the stage’s own shape: --paper is for notes and references.',
    ],
    [
      ['--pdf', 'notes', '--category-words'],
      '--category-words is for pictures (--png or --svg) and the slides (--pdf slides).',
    ],
    [['--pdf', 'notes', '--paper', 'legal'], '--paper is letter (the default) or a4, not "legal".'],
    [['--pdf', 'notes', '--step', 'S04.2a'], '--step is for pictures (--png or --svg).'],
    [['--pdf', 'notes', '--no-notes'], '--no-notes is for the HTML file (--html).'],
    [['--png', '--map', '--paper', 'a4'], '--paper is for the PDFs (--pdf).'],
    [['--pdf', 'notes', '--html'], 'Export one format at a time (--html, --pdf given).'],
  ])('%j is refused', async (options, message) => {
    const result = await run('export', project, ...options);
    expect(result.code).toBe(2);
    expect(result.err.trim()).toBe(message);
  });

  it('refuses the slides of a story with no steps, before any browser starts', async () => {
    const bare = join(dir, 'bare.loopweft');
    expect((await run('new', bare, '--title', 'Bare')).code).toBe(0);
    const result = await run('export', bare, '--pdf', 'slides');
    expect(result.code).toBe(2);
    expect(result.err.trim()).toBe('The story has no steps yet, so there are no slides to make.');
  });

  it('never writes a PDF over the project', async () => {
    const result = await run('export', project, '--pdf', 'references', '-o', project, '--force');
    expect(result.code).toBe(2);
    expect(result.err.trim()).toBe('The PDF would replace the project; name another with -o.');
    expect(existsSync(project)).toBe(true);
  });
});
