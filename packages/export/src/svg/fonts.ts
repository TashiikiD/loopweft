// The fonts an SVG drawing carries: of the page's @font-face rules (Loopweft's two fonts, as data addresses,
// split by the font files into ranges of characters), those of the families the drawing uses whose ranges
// hold a character it draws. So a drawing in Latin text carries only the Latin files of the two fonts.
import { splitTop } from './css.ts';

/** The first family a font-family list names, unquoted. */
export const firstFamily = (list: string): string =>
  (splitTop(list)[0] ?? '').replace(/^["']|["']$/g, '').trim();

/** Reads a unicode-range ("U+0000-00FF, U+0131") as ranges of code points; all of them if there is none. */
export function unicodeRanges(text: string | null): [number, number][] {
  if (!text) return [[0, 0x10ffff]];
  const ranges: [number, number][] = [];
  for (const part of splitTop(text)) {
    const m = /^U\+([0-9A-F?]+)(?:-([0-9A-F]+))?$/i.exec(part.trim());
    if (!m) continue;
    const start = m[1] as string;
    if (start.includes('?')) {
      ranges.push([
        Number.parseInt(start.replace(/\?/g, '0'), 16),
        Number.parseInt(start.replace(/\?/g, 'F'), 16),
      ]);
    } else {
      const a = Number.parseInt(start, 16);
      ranges.push([a, m[2] ? Number.parseInt(m[2], 16) : a]);
    }
  }
  return ranges;
}

/** The @font-face rules of `styles` that the drawing needs, as one block of CSS (empty if none). */
export function selectFontFaces(styles: string, chars: ReadonlyMap<string, ReadonlySet<string>>): string {
  // Characters by the family each was drawn in (its list's first family).
  const wanted = new Map<string, number[]>();
  for (const [list, set] of chars) {
    const family = firstFamily(list).toLowerCase();
    const points = wanted.get(family) ?? [];
    for (const ch of set) points.push(ch.codePointAt(0) as number);
    wanted.set(family, points);
  }
  const rules: string[] = [];
  for (const rule of styles.match(/@font-face\s*\{[^}]*\}/g) ?? []) {
    const family = /font-family:\s*([^;]+);/.exec(rule)?.[1];
    if (!family) continue;
    const points = wanted.get(firstFamily(family).toLowerCase());
    if (!points?.length) continue;
    const ranges = unicodeRanges(/unicode-range:\s*([^;]+);/.exec(rule)?.[1] ?? null);
    if (points.some((p) => ranges.some(([a, b]) => p >= a && p <= b))) rules.push(rule);
  }
  return rules.join('\n');
}
