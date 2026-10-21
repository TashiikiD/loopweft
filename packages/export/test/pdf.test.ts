// The speaker notes and references PDFs: made in Node (as the Studio makes them in the browser, with the same
// code), the same bytes every time and on every system (a fingerprint of the example's), well formed (pdf-lib
// reads them back: pages, paper, properties, bookmarks, links), and saying what the project holds.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { type Project, readProject } from '@loopweft/model';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { nodeFonts } from '../node/fonts.ts';
import { notesBlocks, notesPdf, projectDate, referencesBlocks, referencesPdf } from '../src/index.ts';
import { type Block, PAPER } from '../src/pdf/typeset.ts';

const read = readProject(
  readFileSync(new URL('../../../examples/polycrisis.loopweft', import.meta.url), 'utf8'),
);
if (!read.ok) throw new Error('The example does not open.');
const example: Project = read.project;

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** The text of a document's blocks, a paragraph a line, chips as "[23]". */
function textOf(blocks: readonly Block[]): string[] {
  return blocks.flatMap((b) => {
    if (b.kind === 'page') return ['<page>'];
    if (b.kind === 'bookmark') return [`<bookmark ${b.title}>`];
    if (b.kind === 'rule') return ['<rule>'];
    const marker = b.p.marker ? `${b.p.marker.text} ` : '';
    return [marker + b.p.inlines.map((i) => ('chip' in i ? `[${i.chip}]` : i.text)).join('')];
  });
}

describe('the example as PDFs', () => {
  // Pure TypeScript and pinned fonts: these change only when the PDFs' design or the example does.
  it.each([
    ['notes', 'letter', 18, '3706c44b39d281f92a44faf81e8a07908c1e53611849853dffb83d46ba10f6c4'],
    ['notes', 'a4', 18, 'a1ddc7724df88635db81adfac9947a0d0898ce70eb7a020e585298d1c74dc1be'],
    ['references', 'letter', 3, '49faf60d0a946fb12aacd4e0fa70b261c4be7841dea223aa770db58462a9da47'],
    ['references', 'a4', 3, 'fe9550e9b8de4ae14acc1b81916c1595fb4f9773eee313629876f307028cf9fe'],
  ] as const)('%s on %s: %i pages, the same bytes every time', async (which, paper, pages, fingerprint) => {
    const make = which === 'notes' ? notesPdf : referencesPdf;
    const a = await make(example, { paper, fonts: nodeFonts });
    const b = await make(example, { paper, fonts: nodeFonts });
    expect(Buffer.from(a.bytes).equals(Buffer.from(b.bytes))).toBe(true);
    expect(a.pages).toBe(pages);
    expect(a.notes).toEqual([]);
    expect(sha(a.bytes)).toBe(fingerprint);

    const doc = await PDFDocument.load(a.bytes, { updateMetadata: false });
    expect(doc.getPageCount()).toBe(pages);
    const { width, height } = doc.getPage(0).getSize();
    expect([width, height]).toEqual([...PAPER[paper]]);
    expect(doc.getTitle()).toBe(
      `${example.meta.title} · ${which === 'notes' ? 'Speaker notes' : 'References'}`,
    );
    expect(doc.getProducer()).toBe('Loopweft');
    expect(doc.getCreator()).toBe('Loopweft');
    // The example names no author and has no saved date: none is invented.
    expect(doc.getAuthor()).toBeUndefined();
    expect(doc.getCreationDate()).toBeUndefined();
  });

  it('gives the notes a bookmark for each scene, and the references links to every DOI', async () => {
    const notes = await PDFDocument.load(
      (await notesPdf(example, { paper: 'letter', fonts: nodeFonts })).bytes,
    );
    const outlines = notes.catalog.lookup(PDFName.of('Outlines'), PDFDict);
    expect(outlines.lookup(PDFName.of('Count'))?.toString()).toBe('11');
    const refs = await PDFDocument.load(
      (await referencesPdf(example, { paper: 'letter', fonts: nodeFonts })).bytes,
    );
    const links = refs
      .getPages()
      .flatMap((page) => page.node.Annots()?.asArray() ?? [])
      .map((ref) =>
        refs.context.lookup(ref, PDFDict).lookup(PDFName.of('A'), PDFDict).lookup(PDFName.of('URI')),
      );
    const urls = links.map((u) => u?.toString().slice(1, -1));
    for (const source of example.sources) {
      if (source.doi)
        expect(
          urls.some((u) => u?.includes(source.doi as string)),
          source.id,
        ).toBe(true);
    }
  });
});

describe('what the speaker notes say', () => {
  const lines = textOf(notesBlocks(example));

  it('opens with the title and how to read the slide marks', () => {
    expect(lines[0]).toBe(example.meta.title);
    expect(lines[1]).toBe('Speaker notes');
    expect(lines).toContain(
      '[12]marks where slide 12 of the slides PDF comes up: it has one page per step, in this order.',
    );
  });

  it('gives each scene a page, numbered as its caption, with its slides, timing and steps', () => {
    expect(lines.filter((l) => l === '<page>')).toHaveLength(10);
    expect(lines).toContain('<bookmark Title page>');
    expect(lines).toContain('Scene 01 · Not a perfect storm');
    expect(lines).toContain('Slides 2–5 · 1:00 of the talk (0:00 to 1:00)');
    expect(lines).toContain('Slide 1 · untimed');
    expect(lines).toContain('[2]S01.1 · Six crises, apart (due at 0:00)');
    // Every step has its slide number, 1 to 70, in story order.
    const chips = lines.flatMap((l) => [...l.matchAll(/^\[(\d+)\]S/g)].map((m) => Number(m[1])));
    expect(chips).toEqual(Array.from({ length: 70 }, (_, i) => i + 1));
  });

  it('sets the script with the slide each key press brings up, the last mark the next scene’s first', () => {
    const project: Project = structuredClone(example);
    const [, one, two] = project.story.scenes;
    if (!one || !two) throw new Error('The example has its scenes.');
    one.script =
      'First words [>] after the second step [>] the third [>] the fourth [>] and on to scene two.';
    const text = textOf(notesBlocks(project));
    expect(text).toContain(
      'First words[3]after the second step[4]the third[5]the fourth[6]and on to scene two.',
    );
    expect(text).toContain('SCRIPT');
  });

  it('shows the author and course only where the project gives them', () => {
    expect(lines[2]).not.toContain('·');
    const credited = { ...example, meta: { ...example.meta, author: 'A. Presenter', course: 'Systems 101' } };
    expect(textOf(notesBlocks(credited))[2]).toBe('A. Presenter · Systems 101');
  });
});

describe('what the references say', () => {
  it('lists every source as APA, with where it is cited and its licence, and the images’ credits', () => {
    const lines = textOf(referencesBlocks(example));
    expect(lines[0]).toBe('References');
    expect(lines).toContain(example.meta.description);
    expect(lines.some((l) => l.startsWith('Brosig, M. (2025). How do crises spread?'))).toBe(true);
    expect(lines.some((l) => /Cited in scenes 03, 04, .* and 10\. Licence: CC BY 4\.0\.$/.test(l))).toBe(
      true,
    );
    expect(lines).toContain('Images');
    expect(lines.some((l) => l.startsWith('Credit: Fig. 5, Richards, Lupton & Allwood (2021)'))).toBe(true);
    expect(lines.some((l) => l.includes('Shown at S05.6b (slide 37).'))).toBe(true);
  });

  it('says so when the story cites a source nowhere, and when an image has no credit', () => {
    const project: Project = structuredClone(example);
    project.sources.push({ id: 'unused', apa: 'Nobody, A. (2020). *Never cited*.', label: 'Nobody (2020)' });
    for (const scene of project.story.scenes)
      for (const step of scene.steps)
        for (const overlay of step.overlays) if (overlay.type === 'image') delete overlay.credit;
    const lines = textOf(referencesBlocks(project));
    const at = lines.findIndex((l) => l.startsWith('Nobody, A. (2020).'));
    expect(lines[at + 1]).toBe('Not cited in the story.');
    expect(lines.some((l) => l.startsWith('The project gives no credit for this image.'))).toBe(true);
  });
});

describe('characters and dates', () => {
  it('names a character neither font has, rather than leave it out', async () => {
    const project = { ...example, meta: { ...example.meta, title: 'Polycrisis 🌍 map' } };
    const made = await referencesPdf(project, { paper: 'letter', fonts: nodeFonts });
    expect(made.notes).toEqual([
      'Neither font has these characters, so they show as empty boxes: 🌍 (U+1F30D).',
    ]);
  });

  it('dates a PDF by the project’s own last save, never the clock', async () => {
    expect(projectDate(example)).toBeNull();
    const saved = { ...example, meta: { ...example.meta, modified: '2026-10-20' } };
    expect(projectDate(saved)?.toISOString()).toBe('2026-10-20T00:00:00.000Z');
    const doc = await PDFDocument.load(
      (await referencesPdf(saved, { paper: 'a4', fonts: nodeFonts })).bytes,
      {
        updateMetadata: false,
      },
    );
    expect(doc.getCreationDate()?.toISOString()).toBe('2026-10-20T00:00:00.000Z');
    expect(doc.getModificationDate()?.toISOString()).toBe('2026-10-20T00:00:00.000Z');
  });
});
