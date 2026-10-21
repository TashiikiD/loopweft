// The slides as a PDF: one 16:9 page per step, in story order, each the step as the audience sees it once its
// motion is over (drawn by the export page, as PNG pictures are, then kept as a high-quality JPEG), with a
// bookmark at each scene's first slide. Nothing is drawn on the slides: a reader's page number is the slide's,
// as the speaker notes' "▶ 23" counts them. A backup for the day, and a handout.
import type { Project } from '@loopweft/model';
import { deckOf, sceneTag } from '@loopweft/player';
import { PDFDocument, PDFHexString, PDFName, type PDFPage, type PDFRef } from 'pdf-lib';
import { projectDate } from './document.ts';

/** A slide's page: 1920 × 1080 stage pixels at 0.75 point each (20 × 11.25 inches), as the talk's backup had. */
export const SLIDE_PAGE = [1440, 810] as const;

/**
 * How the slides' pictures are kept: JPEG at this quality (0 to 1). At 0.95 the example's 70 slides take about
 * 15 MB (its PNG pictures take 113 MB); text and fine lines stay clean.
 */
export const SLIDE_QUALITY = 0.95;

export interface SlidePicture {
  /** The step, e.g. "S04.2a". */
  key: string;
  /** The picture, as JPEG. */
  jpeg: Uint8Array;
}

export interface SlidesResult {
  bytes: Uint8Array;
  pages: number;
}

/** Puts the slides' pictures (one per step, in story order) into a PDF with a bookmark for each scene. */
export async function slidesPdf(project: Project, pictures: readonly SlidePicture[]): Promise<SlidesResult> {
  const deck = deckOf(project);
  const keys = deck.scenes.flatMap((scene) => scene.steps.map((s) => s.key));
  if (pictures.length !== keys.length || pictures.some((p, k) => p.key !== keys[k])) {
    throw new Error('The slides must be every step of the story, in its order.');
  }
  const doc = await PDFDocument.create({ updateMetadata: false });
  const pages: PDFPage[] = [];
  for (const picture of pictures) {
    const image = await doc.embedJpg(picture.jpeg);
    const page = doc.addPage([SLIDE_PAGE[0], SLIDE_PAGE[1]]);
    page.drawImage(image, { x: 0, y: 0, width: SLIDE_PAGE[0], height: SLIDE_PAGE[1] });
    pages.push(page);
  }
  // A bookmark at each scene's first slide: "01 · Not a perfect storm", or a title page by its title.
  const context = doc.context;
  const outlinesRef = context.nextRef();
  const entries: { title: string; page: number }[] = [];
  let at = 0;
  for (const scene of deck.scenes) {
    entries.push({
      title: scene.number === undefined ? scene.title : `${sceneTag(scene)} · ${scene.title}`,
      page: at,
    });
    at += scene.steps.length;
  }
  const refs: PDFRef[] = entries.map(() => context.nextRef());
  entries.forEach((entry, k) => {
    const item = context.obj({
      Title: PDFHexString.fromText(entry.title),
      Parent: outlinesRef,
      Dest: [pages[entry.page]?.ref as PDFRef, PDFName.of('Fit')],
    });
    if (k > 0) item.set(PDFName.of('Prev'), refs[k - 1] as PDFRef);
    if (k < refs.length - 1) item.set(PDFName.of('Next'), refs[k + 1] as PDFRef);
    context.assign(refs[k] as PDFRef, item);
  });
  if (refs.length) {
    context.assign(
      outlinesRef,
      context.obj({
        Type: 'Outlines',
        First: refs[0] as PDFRef,
        Last: refs.at(-1) as PDFRef,
        Count: refs.length,
      }),
    );
    doc.catalog.set(PDFName.of('Outlines'), outlinesRef);
    doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
  }
  doc.setTitle(`${project.meta.title} · Slides`);
  if (project.meta.author) doc.setAuthor(project.meta.author);
  doc.setSubject('Slides');
  doc.setCreator('Loopweft');
  doc.setProducer('Loopweft');
  doc.setLanguage('en');
  const date = projectDate(project);
  if (date) {
    doc.setCreationDate(date);
    doc.setModificationDate(date);
  }
  const bytes = await doc.save({ useObjectStreams: true });
  return { bytes, pages: pages.length };
}
