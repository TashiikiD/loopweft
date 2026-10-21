// The slides PDF's assembly (the pictures themselves are drawn in a browser: apps/studio/e2e/export-pdf.spec.ts):
// one 16:9 page per step in story order, the picture filling it, a bookmark at each scene's first slide, the
// project's properties, the same bytes from the same pictures.
import { readFileSync } from 'node:fs';
import { type Project, readProject, stepKey } from '@loopweft/model';
import { PDFArray, PDFDict, PDFDocument, type PDFHexString, PDFName, type PDFRef } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { SLIDE_PAGE, type SlidePicture, slidesPdf } from '../src/index.ts';

const read = readProject(
  readFileSync(new URL('../../../examples/polycrisis.loopweft', import.meta.url), 'utf8'),
);
if (!read.ok) throw new Error('The example does not open.');
const example: Project = read.project;

/** The smallest whole JPEG: one white pixel. */
const JPEG = Uint8Array.from(
  atob(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  ),
  (c) => c.charCodeAt(0),
);

const keys = example.story.scenes.flatMap((s) => s.steps.map((t) => stepKey(s.id, t.id)));
const pictures: SlidePicture[] = keys.map((key) => ({ key, jpeg: JPEG }));

describe('the slides PDF', () => {
  it('has a 16:9 page per step, each filled by its picture, and the same bytes from the same pictures', async () => {
    const made = await slidesPdf(example, pictures);
    expect(made.pages).toBe(70);
    expect(Buffer.from((await slidesPdf(example, pictures)).bytes).equals(Buffer.from(made.bytes))).toBe(
      true,
    );
    const doc = await PDFDocument.load(made.bytes, { updateMetadata: false });
    expect(doc.getPageCount()).toBe(70);
    for (const page of doc.getPages())
      expect(page.getSize()).toEqual({ width: SLIDE_PAGE[0], height: SLIDE_PAGE[1] });
    expect(doc.getTitle()).toBe(`${example.meta.title} · Slides`);
    expect(doc.getProducer()).toBe('Loopweft');
    expect(doc.getCreationDate()).toBeUndefined();
  });

  it('opens each scene’s bookmark at its first slide, named as its caption names it', async () => {
    const doc = await PDFDocument.load((await slidesPdf(example, pictures)).bytes);
    const outlines = doc.catalog.lookup(PDFName.of('Outlines'), PDFDict);
    const pageOf = new Map(doc.getPages().map((p, i) => [p.ref.toString(), i + 1]));
    const marks: string[] = [];
    let item = outlines.lookup(PDFName.of('First'), PDFDict) as PDFDict | undefined;
    while (item) {
      const title = (item.lookup(PDFName.of('Title')) as PDFHexString).decodeText();
      const dest = item.lookup(PDFName.of('Dest'), PDFArray).get(0) as PDFRef;
      marks.push(`${title} @${pageOf.get(dest.toString())}`);
      const next = item.get(PDFName.of('Next'));
      item = next ? (doc.context.lookup(next, PDFDict) as PDFDict) : undefined;
    }
    expect(marks[0]).toBe('Title page @1');
    expect(marks[1]).toBe('01 · Not a perfect storm @2');
    expect(marks[2]).toBe('02 · From idea to institutions @6');
    expect(marks).toHaveLength(11);
  });

  it('refuses pictures that are not every step in story order', async () => {
    await expect(slidesPdf(example, pictures.slice(1))).rejects.toThrow(
      /every step of the story, in its order/,
    );
    await expect(slidesPdf(example, [...pictures].reverse())).rejects.toThrow(/in its order/);
  });
});
