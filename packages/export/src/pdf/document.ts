// What every PDF of a project shares: its properties (title, author if the project names one, Loopweft as the
// program that made it), its dates (the project's own "modified" date, never the clock; none if the project
// has none), and the report of characters no font had.
import type { Project } from '@loopweft/model';
import type { PDFDocument } from 'pdf-lib';
import { type FontPlan, type FontReader, planFonts } from './fonts.ts';
import { type Block, charactersOf, type Paper, type Run, Typesetter } from './typeset.ts';

export interface DocumentPdfOptions {
  paper: Paper;
  /** Reads Loopweft's font files (Node: from @fontsource; the Studio: its own copies). */
  fonts: FontReader;
}

export interface PdfResult {
  bytes: Uint8Array;
  pages: number;
  /** What a reader should know about this file (characters no font had). */
  notes: string[];
}

/** The date a project was last saved, as a date for the PDF's properties; none if it has none. */
export function projectDate(project: Project): Date | null {
  const modified = project.meta.modified;
  if (!modified) return null;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(modified) ? `${modified}T00:00:00Z` : modified);
  return Number.isNaN(date.getTime()) ? null : date;
}

function properties(doc: PDFDocument, project: Project, subject: string): void {
  doc.setTitle(`${project.meta.title} · ${subject}`);
  if (project.meta.author) doc.setAuthor(project.meta.author);
  doc.setSubject(subject);
  doc.setCreator('Loopweft');
  doc.setProducer('Loopweft');
  doc.setLanguage('en');
  const date = projectDate(project);
  if (date) {
    doc.setCreationDate(date);
    doc.setModificationDate(date);
  }
}

/** The characters no font had, as notes. */
function missingNotes(plan: FontPlan): string[] {
  const all = new Set<string>();
  for (const set of plan.missing.values()) for (const ch of set) all.add(ch);
  if (all.size === 0) return [];
  const list = [...all]
    .sort()
    .map((ch) => `${ch} (U+${(ch.codePointAt(0) as number).toString(16).toUpperCase().padStart(4, '0')})`)
    .join(', ');
  return [`Neither font has these characters, so they show as empty boxes: ${list}.`];
}

/** Sets blocks into a PDF with the project's properties, bookmarks and a footer naming the document. */
export async function makePdf(
  project: Project,
  blocks: readonly Block[],
  options: DocumentPdfOptions & { subject: string; footer: string; bookmarks?: (t: Typesetter) => void },
): Promise<PdfResult> {
  const footerRun: Run = { text: options.footer, face: 'sans', size: 8.5 };
  const plan = await planFonts(options.fonts, charactersOf(blocks, [footerRun]));
  const t = await Typesetter.create(plan, options.paper);
  t.set(blocks);
  t.footers(options.footer);
  t.outline();
  properties(t.doc, project, options.subject);
  const bytes = await t.doc.save({ useObjectStreams: true });
  return { bytes, pages: t.pages.length, notes: missingNotes(plan) };
}
