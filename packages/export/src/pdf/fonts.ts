// The fonts of the PDFs: Fraunces for reading (as the stage's serif) and Inter for headings, notes and figures,
// both free (OFL), with Noto Sans Math (OFL) for arrows and signs neither has. Each style comes as several files, one per range of characters (Latin, Latin Extended, …);
// a character is set from the first file of its style that has it, Fraunces's styles falling back to Inter's
// for the scripts Fraunces lacks (Greek, Cyrillic). Only the files a document needs are read, and only the
// letters it uses are embedded. A character no file has is named in the document's report, never dropped.
import fontkit from '@pdf-lib/fontkit';

/** The styles the PDFs set text in. */
export type Face = 'sans' | 'sansBold' | 'sansItalic' | 'serif' | 'serifBold' | 'serifItalic';

export const FACES: readonly Face[] = ['sans', 'sansBold', 'sansItalic', 'serif', 'serifBold', 'serifItalic'];

const INTER_SUBSETS = ['latin', 'latin-ext', 'vietnamese', 'greek', 'greek-ext', 'cyrillic', 'cyrillic-ext'];
const FRAUNCES_SUBSETS = ['latin', 'latin-ext', 'vietnamese'];

const inter = (weight: number, style: 'normal' | 'italic') =>
  INTER_SUBSETS.map((subset) => `inter/files/inter-${subset}-${weight}-${style}.woff`);
const fraunces = (weight: number, style: 'normal' | 'italic') =>
  FRAUNCES_SUBSETS.map((subset) => `fraunces/files/fraunces-${subset}-${weight}-${style}.woff`);

/**
 * Arrows and mathematical signs, which neither font's files carry (→, ↔, ⇒, ≈ …): Noto Sans Math (OFL), the
 * last file of every style.
 */
const SYMBOLS = 'noto-sans-math/files/noto-sans-math-latin-400-normal.woff';

/** Each style's files, in the order a character is looked for, as paths inside node_modules/@fontsource. */
export const FONT_FILES: Readonly<Record<Face, readonly string[]>> = {
  sans: [...inter(400, 'normal'), SYMBOLS],
  sansBold: [...inter(600, 'normal'), SYMBOLS],
  sansItalic: [...inter(400, 'italic'), SYMBOLS],
  serif: [...fraunces(400, 'normal'), ...inter(400, 'normal'), SYMBOLS],
  serifBold: [...fraunces(600, 'normal'), ...inter(600, 'normal'), SYMBOLS],
  serifItalic: [...fraunces(400, 'italic'), ...inter(400, 'italic'), SYMBOLS],
};

/** Every font file the PDFs may read, once each. */
export const ALL_FONT_FILES: readonly string[] = [...new Set(Object.values(FONT_FILES).flat())];

/** Reads a font file by its path inside @fontsource (Node reads the package; the Studio fetches its copy). */
export type FontReader = (file: string) => Promise<Uint8Array>;

interface Parsed {
  hasGlyphForCodePoint(codePoint: number): boolean;
}

/** The font files a document needs, chosen from the characters it sets in each style. */
export interface FontPlan {
  /** For each style, which file sets each character (by code point). */
  fileFor(face: Face, codePoint: number): string | null;
  /** The bytes of every file used. */
  bytes: ReadonlyMap<string, Uint8Array>;
  /** Characters no file of their style has, by style. */
  missing: ReadonlyMap<Face, ReadonlySet<string>>;
}

/** Works out which files set the characters of each style, reading files only until every character is found. */
export async function planFonts(
  read: FontReader,
  used: ReadonlyMap<Face, ReadonlySet<string>>,
): Promise<FontPlan> {
  const bytes = new Map<string, Uint8Array>();
  const parsed = new Map<string, Parsed>();
  const load = async (file: string): Promise<Parsed> => {
    const known = parsed.get(file);
    if (known) return known;
    const data = await read(file);
    const font = fontkit.create(data as unknown as Buffer) as unknown as Parsed;
    bytes.set(file, data);
    parsed.set(file, font);
    return font;
  };
  const chosen = new Map<Face, Map<number, string>>();
  const missing = new Map<Face, Set<string>>();
  for (const face of FACES) {
    const chars = used.get(face);
    if (!chars?.size) continue;
    let left = [...chars].map((c) => c.codePointAt(0) as number).filter((p) => p > 0x20 || p === 0x20);
    const byPoint = new Map<number, string>();
    for (const file of FONT_FILES[face]) {
      if (left.length === 0) break;
      const font = await load(file);
      left = left.filter((p) => {
        if (!font.hasGlyphForCodePoint(p)) return true;
        byPoint.set(p, file);
        return false;
      });
    }
    chosen.set(face, byPoint);
    if (left.length) missing.set(face, new Set(left.map((p) => String.fromCodePoint(p))));
  }
  // Files read only to find that they lack a character are not embedded.
  const usedFiles = new Set([...chosen.values()].flatMap((m) => [...m.values()]));
  for (const file of [...bytes.keys()]) if (!usedFiles.has(file)) bytes.delete(file);
  return {
    fileFor: (face, point) => chosen.get(face)?.get(point) ?? null,
    bytes,
    missing,
  };
}
