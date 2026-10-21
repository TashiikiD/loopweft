// The references as a PDF: the project's sources as an APA 7 list (alphabetical, a hanging indent, titles in
// italics, DOIs and web addresses as links), each with what the map draws from it if the project says, the
// scenes that cite it (or that the story does not), and its licence; a supplement sits under its work. The
// header gives the project's title, author and course where it has them, and its description (what the map is
// and is not). At the end, every image the story shows, with its caption, its credit and where it appears.
import { type Project, referenceList, referenceSpans, stepKey } from '@loopweft/model';
import { citedInWords, deckOf } from '@loopweft/player';
import { type DocumentPdfOptions, makePdf, type PdfResult } from './document.ts';
import { type Block, INK, type Inline, para, run } from './typeset.ts';

const MM = 72 / 25.4;
const HANG = 8 * MM;

/** The blocks of the references. */
export function referencesBlocks(project: Project): Block[] {
  const deck = deckOf(project);
  const blocks: Block[] = [];
  blocks.push(para({ inlines: [run('References', 'sansBold', 20, INK.text)], after: 2 }));
  const titleLine = [project.meta.title, project.meta.author, project.meta.course]
    .filter(Boolean)
    .join(' · ');
  blocks.push(para({ inlines: [run(titleLine, 'sans', 10, INK.muted)], after: 3 }));
  if (project.meta.description) {
    blocks.push(para({ inlines: [run(project.meta.description, 'sans', 10, INK.muted)], after: 2 }));
  }
  blocks.push({ kind: 'rule', before: 6, after: 12 });

  const list = referenceList(project);
  if (list.length === 0) blocks.push(para({ inlines: [run('The project has no sources.', 'serif', 11)] }));
  const reference = (ref: (typeof list)[number], depth: number) => {
    const s = ref.source;
    const inlines: Inline[] = referenceSpans(s.apa).map((span) =>
      span.href
        ? run(span.text, 'serif', 11, INK.accent, span.href)
        : run(span.text, span.italic ? 'serifItalic' : 'serif', 11),
    );
    const doi = s.doi && !s.apa.includes(s.doi) ? `https://doi.org/${s.doi}` : null;
    if (doi) inlines.push(run(` ${doi}`, 'serif', 11, INK.accent, doi));
    blocks.push(para({ inlines, indent: depth, hanging: HANG, after: 1.5, leading: 1.4 }));
    const cited = citedInWords(deck, ref.scenes) || 'Not cited in the story.';
    const about = [s.summary, cited, s.licence ? `Licence: ${s.licence}.` : ''].filter(Boolean).join(' ');
    blocks.push(
      para({ inlines: [run(about, 'sans', 9, INK.muted)], indent: depth + HANG, after: 8, leading: 1.4 }),
    );
    for (const part of ref.parts) reference(part, depth + HANG);
  };
  for (const ref of list) reference(ref, 0);

  // The images the story shows, with their credits.
  const shown = new Map<string, { caption?: string; credit?: string; alt: string; at: string[] }>();
  let slide = 0;
  for (const dscene of deck.scenes) {
    for (const dstep of dscene.steps) {
      slide++;
      for (const overlay of dstep.step.overlays) {
        if (overlay.type !== 'image') continue;
        const known = shown.get(overlay.asset) ?? {
          ...(overlay.caption ? { caption: overlay.caption } : {}),
          ...(overlay.credit ? { credit: overlay.credit } : {}),
          alt: overlay.alt,
          at: [],
        };
        known.at.push(`${stepKey(dscene.id, dstep.step.id)} (slide ${slide})`);
        shown.set(overlay.asset, known);
      }
    }
  }
  if (shown.size) {
    blocks.push(
      para({
        inlines: [run('Images', 'sansBold', 14, INK.heading)],
        before: 14,
        after: 6,
        keepWithNext: true,
      }),
    );
    for (const image of shown.values()) {
      const lead = image.caption ?? image.alt;
      blocks.push(para({ inlines: [run(lead, 'serif', 11)], hanging: HANG, after: 1.5, keepWithNext: true }));
      const facts = [
        image.credit ? `Credit: ${image.credit}.` : 'The project gives no credit for this image.',
        `Shown at ${image.at.join(', ')}.`,
        image.caption ? `Described as: ${image.alt}` : '',
      ]
        .filter(Boolean)
        .join(' ');
      blocks.push(para({ inlines: [run(facts, 'sans', 9, INK.muted)], indent: HANG, after: 8 }));
    }
  }
  return blocks;
}

/** The references PDF of a project. */
export function referencesPdf(project: Project, options: DocumentPdfOptions): Promise<PdfResult> {
  return makePdf(project, referencesBlocks(project), {
    ...options,
    subject: 'References',
    footer: `${project.meta.title} · references`,
  });
}
