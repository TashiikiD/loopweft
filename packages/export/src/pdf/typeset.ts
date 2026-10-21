// Setting text on PDF pages with pdf-lib: paragraphs of runs (each in one of the PDFs' styles, a size and a
// colour, perhaps a link), broken into lines at spaces (a word too long for a line, such as a web address,
// breaks after a slash or a full stop), laid down page after page with headings kept with what follows them.
// Also the small chips that mark a slide ("▶ 23"), link annotations, bookmarks and page footers.
import fontkit from '@pdf-lib/fontkit';
import {
  PDFDocument,
  type PDFFont,
  PDFHexString,
  PDFName,
  type PDFPage,
  type PDFRef,
  PDFString,
  rgb,
} from 'pdf-lib';
import type { Face, FontPlan } from './fonts.ts';

/** A colour as three numbers from 0 to 1. */
export type Rgb = readonly [number, number, number];

const hex = (h: string): Rgb => [
  Number.parseInt(h.slice(1, 3), 16) / 255,
  Number.parseInt(h.slice(3, 5), 16) / 255,
  Number.parseInt(h.slice(5, 7), 16) / 255,
];

/** The PDFs' colours: dark ink for reading, the stage's green, darker, for headings and marks. */
export const INK = {
  text: hex('#14201b'),
  heading: hex('#0b5e4c'),
  accent: hex('#0b7a62'),
  muted: hex('#4b5d55'),
  rule: hex('#b9cbc3'),
} as const;

export interface Run {
  text: string;
  face: Face;
  size: number;
  colour?: Rgb;
  link?: string;
}

/** A slide's mark, "▶ 23", drawn as a small outlined chip (or "▶" alone with no number). */
export interface Chip {
  chip: string;
  size: number;
}

export type Inline = Run | Chip;

export interface Paragraph {
  inlines: Inline[];
  /** Left indent of every line, in points. */
  indent?: number;
  /** Further indent of every line but the first (a hanging indent, as an APA list has). */
  hanging?: number;
  /** A bullet or number set before the first line, in the indent. */
  marker?: Run;
  /** Line height as a multiple of the largest size on the line (default 1.45). */
  leading?: number;
  before?: number;
  after?: number;
  /** Keep this paragraph on the page with the start of the next (a heading). */
  keepWithNext?: boolean;
}

export type Block =
  | { kind: 'p'; p: Paragraph }
  | { kind: 'rule'; before?: number; after?: number }
  | { kind: 'page' }
  /** Where the outline's entry for what follows should open. */
  | { kind: 'bookmark'; title: string };

export type Paper = 'letter' | 'a4';

/** Page sizes in points: US Letter (8.5 × 11 in) and A4 (210 × 297 mm). */
export const PAPER: Readonly<Record<Paper, readonly [number, number]>> = {
  letter: [612, 792],
  a4: [595.28, 841.89],
};

const MM = 72 / 25.4;

/** Margins: 18 mm at the top and bottom, 20 mm at the sides, as the polycrisis talk's PDFs had. */
export const MARGIN = { top: 18 * MM, bottom: 18 * MM, side: 20 * MM } as const;

const isChip = (i: Inline): i is Chip => 'chip' in i;

/** Every character set in each style, for choosing the font files. */
export function charactersOf(blocks: readonly Block[], extra: readonly Run[] = []): Map<Face, Set<string>> {
  const used = new Map<Face, Set<string>>();
  const add = (face: Face, text: string) => {
    const set = used.get(face) ?? new Set<string>();
    for (const ch of text) set.add(ch);
    used.set(face, set);
  };
  const runs = (p: Paragraph): Run[] => [
    ...p.inlines.filter((i): i is Run => !isChip(i)),
    ...(p.marker ? [p.marker] : []),
  ];
  for (const block of blocks) {
    if (block.kind !== 'p') continue;
    for (const run of runs(block.p)) add(run.face, run.text);
    for (const inline of block.p.inlines) if (isChip(inline)) add('sansBold', inline.chip);
  }
  for (const run of extra) add(run.face, run.text);
  add('sans', ' 0123456789of·–');
  return used;
}

/** A piece of a run set in one font file. */
interface Piece {
  text: string;
  font: PDFFont;
  size: number;
  colour: Rgb;
  link?: string;
  width: number;
}

/** A word: pieces that stay together, then the space after it (if any). */
interface Word {
  pieces: Piece[];
  chip?: { text: string; size: number; width: number };
  width: number;
  space: number;
  height: number;
}

export interface Bookmark {
  title: string;
  page: number;
}

/** A PDF being set: its fonts, its pages, where the next line goes. */
export class Typesetter {
  readonly doc: PDFDocument;
  readonly paper: readonly [number, number];
  readonly pages: PDFPage[] = [];
  readonly bookmarks: Bookmark[] = [];
  readonly #plan: FontPlan;
  readonly #fonts = new Map<string, PDFFont>();
  #page: PDFPage | null = null;
  #y = 0;

  private constructor(doc: PDFDocument, plan: FontPlan, paper: Paper) {
    this.doc = doc;
    this.#plan = plan;
    this.paper = PAPER[paper];
  }

  /** A new document with the fonts the plan chose, each embedded with only the letters it sets. */
  static async create(plan: FontPlan, paper: Paper): Promise<Typesetter> {
    // updateMetadata: false, so pdf-lib reads no clock and names no producer of its own.
    const doc = await PDFDocument.create({ updateMetadata: false });
    doc.registerFontkit(fontkit);
    const t = new Typesetter(doc, plan, paper);
    for (const [file, bytes] of plan.bytes) {
      const name = (file.split('/').pop() as string).replace(/\.woff$/, '');
      t.#fonts.set(file, await doc.embedFont(bytes, { subset: true, customName: name }));
    }
    return t;
  }

  get width(): number {
    return this.paper[0] - 2 * MARGIN.side;
  }

  /** The font a character of a style is set in (a character no file has: the style's first file). */
  #fontFor(face: Face, ch: string): PDFFont {
    const file = this.#plan.fileFor(face, ch.codePointAt(0) as number) ?? this.#plan.fileFor(face, 0x20);
    const font = (file && this.#fonts.get(file)) ?? this.#fonts.values().next().value;
    if (!font) throw new Error(`No font was embedded for the ${face} style.`);
    return font;
  }

  /** A run split by the font file each character is set in. */
  #pieces(run: Run): Piece[] {
    const pieces: Piece[] = [];
    for (const ch of run.text) {
      const font = this.#fontFor(run.face, ch);
      const last = pieces.at(-1);
      if (last && last.font === font) last.text += ch;
      else
        pieces.push({
          text: ch,
          font,
          size: run.size,
          colour: run.colour ?? INK.text,
          ...(run.link ? { link: run.link } : {}),
          width: 0,
        });
    }
    for (const p of pieces) p.width = p.font.widthOfTextAtSize(p.text, p.size);
    return pieces;
  }

  #chipWord(chip: Chip): Word {
    const size = chip.size * 0.78;
    const font = this.#fontFor('sansBold', '0');
    const textWidth = chip.chip ? font.widthOfTextAtSize(chip.chip, size) : 0;
    const triangle = size * 0.62;
    const width = 2.6 + triangle + (chip.chip ? 2.2 + textWidth : 0) + 2.6;
    return { pieces: [], chip: { text: chip.chip, size, width }, width, space: 0, height: chip.size };
  }

  /** The words of a paragraph's inlines, broken at spaces. */
  #words(inlines: readonly Inline[]): Word[] {
    const words: Word[] = [];
    let current: Word | null = null;
    const space = (run: Run) => this.#fontFor(run.face, ' ').widthOfTextAtSize(' ', run.size);
    for (const inline of inlines) {
      if (isChip(inline)) {
        current = null;
        const word = this.#chipWord(inline);
        // A chip keeps the space before it, and has one after it.
        word.space = inline.size * 0.28;
        words.push(word);
        continue;
      }
      const parts = inline.text.split(/(\s+)/);
      for (const part of parts) {
        if (!part) continue;
        if (/^\s+$/.test(part)) {
          if (current) current.space = space(inline);
          current = null;
          continue;
        }
        const pieces = this.#pieces({ ...inline, text: part });
        if (!current) {
          current = { pieces: [], width: 0, space: 0, height: inline.size };
          words.push(current);
        }
        current.pieces.push(...pieces);
        current.width += pieces.reduce((n, p) => n + p.width, 0);
        current.height = Math.max(current.height, inline.size);
      }
    }
    return words;
  }

  /** Splits a word too wide for a line: after a slash, full stop or hyphen where it can, else anywhere. */
  #split(word: Word, room: number): Word[] {
    const text = word.pieces.map((p) => p.text).join('');
    const out: Word[] = [];
    let start = 0;
    while (start < text.length) {
      let end = text.length;
      let best = -1;
      for (let i = start + 1; i <= text.length; i++) {
        if (this.#widthOf(word, start, i) > room) {
          end = i - 1;
          break;
        }
        if (i < text.length && /[/.\-_?&=]/.test(text[i - 1] as string)) best = i;
      }
      const cut = end === text.length ? end : best > start ? best : Math.max(start + 1, end);
      out.push(this.#slice(word, start, cut));
      start = cut;
    }
    const last = out.at(-1);
    if (last) last.space = word.space;
    return out;
  }

  #widthOf(word: Word, start: number, end: number): number {
    return this.#slice(word, start, end).width;
  }

  /** Characters start…end of a word, as a word of its own. */
  #slice(word: Word, start: number, end: number): Word {
    const pieces: Piece[] = [];
    let at = 0;
    for (const p of word.pieces) {
      const a = Math.max(start, at);
      const b = Math.min(end, at + p.text.length);
      if (b > a) {
        const text = p.text.slice(a - at, b - at);
        pieces.push({ ...p, text, width: p.font.widthOfTextAtSize(text, p.size) });
      }
      at += p.text.length;
    }
    return { pieces, width: pieces.reduce((n, p) => n + p.width, 0), space: 0, height: word.height };
  }

  /** Lines of words that fit the widths given (the first line's, then the others'). */
  #lines(words: Word[], first: number, rest: number): Word[][] {
    const lines: Word[][] = [];
    let line: Word[] = [];
    let used = 0;
    const room = () => (lines.length === 0 ? first : rest);
    const queue = [...words];
    while (queue.length) {
      const word = queue.shift() as Word;
      const gap = line.length ? (line.at(-1) as Word).space : 0;
      if (line.length && used + gap + word.width > room()) {
        lines.push(line);
        line = [];
        used = 0;
        queue.unshift(word);
        continue;
      }
      if (!line.length && word.width > room() && !word.chip) {
        queue.unshift(...this.#split(word, room()));
        const head = queue.shift() as Word;
        line.push(head);
        used = head.width;
        continue;
      }
      line.push(word);
      used += gap + word.width;
    }
    if (line.length) lines.push(line);
    return lines;
  }

  newPage(): PDFPage {
    this.#page = this.doc.addPage([this.paper[0], this.paper[1]]);
    this.pages.push(this.#page);
    this.#y = this.paper[1] - MARGIN.top;
    return this.#page;
  }

  #pageNow(): PDFPage {
    return this.#page ?? this.newPage();
  }

  /** Room left on this page, in points. */
  get room(): number {
    return this.#page ? this.#y - MARGIN.bottom : Number.POSITIVE_INFINITY;
  }

  /** Marks where a bookmark should open: the page the next line goes on. */
  bookmark(title: string): void {
    this.#pageNow();
    this.bookmarks.push({ title, page: this.pages.length - 1 });
  }

  /** The height a paragraph takes, for keeping a heading with what follows it. */
  heightOf(p: Paragraph): number {
    const indent = p.indent ?? 0;
    const lines = this.#lines(
      this.#words(p.inlines),
      this.width - indent,
      this.width - indent - (p.hanging ?? 0),
    );
    const leading = p.leading ?? 1.45;
    return (
      (p.before ?? 0) +
      lines.reduce((n, l) => n + Math.max(...l.map((w) => w.height)) * leading, 0) +
      (p.after ?? 0)
    );
  }

  /** Lays the blocks down, page after page. */
  set(blocks: readonly Block[]): void {
    blocks.forEach((block, k) => {
      if (block.kind === 'page') {
        if (this.#page) this.newPage();
        return;
      }
      if (block.kind === 'bookmark') {
        this.bookmark(block.title);
        return;
      }
      if (block.kind === 'rule') {
        this.#y -= block.before ?? 6;
        if (this.room < 4) this.newPage();
        const page = this.#pageNow();
        page.drawLine({
          start: { x: MARGIN.side, y: this.#y },
          end: { x: this.paper[0] - MARGIN.side, y: this.#y },
          thickness: 1.2,
          color: rgb(...INK.accent),
        });
        this.#y -= block.after ?? 10;
        return;
      }
      const p = block.p;
      if (p.keepWithNext) {
        // This paragraph, every one after it that is kept with its next, and the start of the one after them.
        let need = 0;
        let j = k;
        for (; j < blocks.length; j++) {
          const b = blocks[j];
          if (b?.kind !== 'p') break;
          if (!b.p.keepWithNext) {
            need += Math.min(this.heightOf(b.p), 40);
            break;
          }
          need += this.heightOf(b.p);
        }
        if (this.room < need) this.newPage();
      }
      this.#paragraph(p);
    });
  }

  #paragraph(p: Paragraph): void {
    this.#pageNow();
    const indent = p.indent ?? 0;
    const hanging = p.hanging ?? 0;
    const leading = p.leading ?? 1.45;
    const lines = this.#lines(this.#words(p.inlines), this.width - indent, this.width - indent - hanging);
    if (this.#y < this.paper[1] - MARGIN.top - 0.5) this.#y -= p.before ?? 0;
    // A short paragraph (four lines or fewer) stays on one page, rather than leave a line or two behind.
    if (lines.length > 1 && lines.length <= 4) {
      const height = lines.reduce((n, l) => n + Math.max(...l.map((w) => w.height)) * leading, 0);
      if (this.room < height && this.#y < this.paper[1] - MARGIN.top - 0.5) this.newPage();
    }
    lines.forEach((line, n) => {
      const size = Math.max(...line.map((w) => w.height));
      const height = size * leading;
      if (this.room < height) this.newPage();
      const page = this.#pageNow();
      const baseline = this.#y - (height - size) / 2 - size * 0.8;
      let x = MARGIN.side + indent + (n === 0 ? 0 : hanging);
      if (n === 0 && p.marker) {
        const [marker] = this.#pieces(p.marker);
        if (marker) {
          page.drawText(marker.text, {
            x: MARGIN.side + indent - marker.width - 4,
            y: baseline,
            size: marker.size,
            font: marker.font,
            color: rgb(...marker.colour),
          });
        }
      }
      line.forEach((word, w) => {
        if (word.chip) this.#drawChip(page, x, baseline, word.chip);
        else {
          let px = x;
          for (const piece of word.pieces) {
            page.drawText(piece.text, {
              x: px,
              y: baseline,
              size: piece.size,
              font: piece.font,
              color: rgb(...piece.colour),
            });
            if (piece.link) this.#link(page, px, baseline, piece.width, piece.size, piece.link);
            px += piece.width;
          }
        }
        x += word.width + (w < line.length - 1 ? word.space : 0);
      });
      this.#y -= height;
    });
    this.#y -= p.after ?? 0;
  }

  /** "▶ 23": a triangle and the slide's number in a thin outlined box, sitting on the baseline. */
  #drawChip(
    page: PDFPage,
    x: number,
    baseline: number,
    chip: { text: string; size: number; width: number },
  ): void {
    const h = chip.size * 1.32;
    const bottom = baseline - chip.size * 0.28;
    page.drawRectangle({
      x,
      y: bottom,
      width: chip.width,
      height: h,
      borderColor: rgb(...INK.accent),
      borderWidth: 0.8,
    });
    const t = chip.size * 0.62;
    const tx = x + 2.6;
    const ty = bottom + (h - t) / 2;
    page.drawSvgPath(`M0 0 L${t * 0.9} ${t / 2} L0 ${t} Z`, { x: tx, y: ty + t, color: rgb(...INK.accent) });
    if (chip.text) {
      page.drawText(chip.text, {
        x: tx + t + 2.2,
        y: baseline,
        size: chip.size,
        font: this.#fontFor('sansBold', '0'),
        color: rgb(...INK.accent),
      });
    }
  }

  /** A link over a piece of text: a web address the reader opens by clicking it. */
  #link(page: PDFPage, x: number, baseline: number, width: number, size: number, url: string): void {
    const annotation = this.doc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [x, baseline - size * 0.25, x + width, baseline + size * 0.85],
      Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
    });
    page.node.addAnnot(this.doc.context.register(annotation));
  }

  /** A footer on every page: the document's name on the left, "3 of 12" on the right. */
  footers(name: string): void {
    const size = 8.5;
    const font = this.#fontFor('sans', 'a');
    this.pages.forEach((page, k) => {
      const y = MARGIN.bottom / 2;
      page.drawText(name, { x: MARGIN.side, y, size, font, color: rgb(...INK.muted) });
      const count = `${k + 1} of ${this.pages.length}`;
      page.drawText(count, {
        x: this.paper[0] - MARGIN.side - font.widthOfTextAtSize(count, size),
        y,
        size,
        font,
        color: rgb(...INK.muted),
      });
    });
  }

  /** The bookmarks as the PDF's outline, shown beside the pages by most readers. */
  outline(): void {
    if (this.bookmarks.length === 0) return;
    const context = this.doc.context;
    const outlinesRef = context.nextRef();
    const refs: PDFRef[] = this.bookmarks.map(() => context.nextRef());
    this.bookmarks.forEach((b, k) => {
      const page = this.pages[b.page] as PDFPage;
      const item = context.obj({
        Title: PDFHexString.fromText(b.title),
        Parent: outlinesRef,
        Dest: [page.ref, PDFName.of('XYZ'), null, null, null],
      });
      if (k > 0) item.set(PDFName.of('Prev'), refs[k - 1] as PDFRef);
      if (k < refs.length - 1) item.set(PDFName.of('Next'), refs[k + 1] as PDFRef);
      context.assign(refs[k] as PDFRef, item);
    });
    context.assign(
      outlinesRef,
      context.obj({
        Type: 'Outlines',
        First: refs[0] as PDFRef,
        Last: refs.at(-1) as PDFRef,
        Count: refs.length,
      }),
    );
    this.doc.catalog.set(PDFName.of('Outlines'), outlinesRef);
    this.doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
  }
}

/** A run, briefly. */
export const run = (text: string, face: Face, size: number, colour?: Rgb, link?: string): Run => ({
  text,
  face,
  size,
  ...(colour ? { colour } : {}),
  ...(link ? { link } : {}),
});

/** A paragraph block. */
export const para = (p: Paragraph): Block => ({ kind: 'p', p });
