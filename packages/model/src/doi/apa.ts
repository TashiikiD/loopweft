// The parts of an APA 7 reference that every DOI record shares: people's names and initials, author and
// editor lists, the in-text label, titles cleaned of their markup, sentence punctuation, and licence names.
// The drafts from Crossref (crossref.ts) and DataCite (datacite.ts) are written with them, so both follow the
// same rules: the APA Publication Manual (7th ed.), chapters 9 and 10.

/** `warning`: read before citing (a retraction). `missing`: a part APA wants that the record lacks. `check`: verify. */
export type NoteLevel = 'warning' | 'missing' | 'check';

export interface DraftNote {
  level: NoteLevel;
  message: string;
}

/** Where a DOI's record came from: the registration agency that holds it. */
export type Agency = 'Crossref' | 'DataCite';

export interface ReferenceDraft {
  /** The DOI as the record writes it. */
  doi: string;
  /** The APA 7 reference, `*asterisks*` marking italics. */
  apa: string;
  /** The in-text form, e.g. "Lawrence et al. (2024)", when the work has authors or editors. */
  label?: string;
  /** The licence the record gives, by its name (a Creative Commons licence, or one DataCite names by SPDX). */
  licence?: string;
  /** The agency whose record this is. */
  agency: Agency;
  /** The agency's name for the kind of work: Crossref's `journal-article`, DataCite's `Dataset`. */
  type: string;
  /** The year the reference gives, or `n.d.`. */
  year: string;
  notes: DraftNote[];
}

export type Json = Record<string, unknown>;

export interface Person {
  given?: string;
  family?: string;
  name?: string;
  suffix?: string;
}

export const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// ----- text -----

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity.startsWith('#')) {
      const hex = entity[1] === 'x' || entity[1] === 'X';
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[entity.toLowerCase()] ?? whole;
  });
}

/** Digits as Unicode subscripts or superscripts, by digit. */
const scripts = (glyphs: string): Record<string, string> =>
  Object.fromEntries([...glyphs].map((glyph, digit) => [String(digit), glyph]));
const SUB = scripts('₀₁₂₃₄₅₆₇₈₉');
const SUP = scripts('⁰¹²³⁴⁵⁶⁷⁸⁹');

/**
 * Crossref's text without its markup: entities decoded, sub- and superscript digits as Unicode (CO₂),
 * other tags dropped, spaces collapsed. `markItalics` turns <i> into `*` (for text set in roman, such as
 * an article title); otherwise italics are dropped (the text is italic already).
 */
function plain(raw: string, markItalics = false): string {
  let text = raw.replace(/<(sub|sup)\b[^>]*>([^<]*)<\/\1>/gi, (_, tag: string, inner: string) => {
    const digits = decodeEntities(inner);
    const map = tag.toLowerCase() === 'sub' ? SUB : SUP;
    return [...digits].every((c) => c in map) ? [...digits].map((c) => map[c]).join('') : digits;
  });
  text = text.replace(/<\/?(?:i|em)\b[^>]*>/gi, markItalics ? '*' : '');
  text = decodeEntities(text.replace(/<[^>]*>/g, ''));
  return text
    .replace(/\*\s*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const text = (value: unknown, markItalics = false): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const cleaned = plain(value, markItalics);
  return cleaned || undefined;
};

/** The first non-empty text of a Crossref list such as `title` or `container-title`. */
export const firstText = (value: unknown, markItalics = false): string | undefined => {
  if (!Array.isArray(value)) return text(value, markItalics);
  for (const item of value) {
    const t = text(item, markItalics);
    if (t) return t;
  }
  return undefined;
};

/** Page and issue ranges with an en dash: 526-549 becomes 526–549. */
export const ranged = (value: string) => value.replace(/\s*[-‐‑‒–—]+\s*/g, '–');

/** The first word after a colon, question mark or em dash capitalized, when it is written all in lower case. */
export const capitalizeSubtitles = (title: string) =>
  title.replace(
    /([:?!—]\s+)(\*?)(\p{Ll}+)(?=[\s,.;:?!*]|$)/gu,
    (_, gap: string, star: string, word: string) =>
      `${gap}${star}${word.charAt(0).toLocaleUpperCase()}${word.slice(1)}`,
  );

/** True when most longer words after the first are capitalized, as in title case. */
export function looksTitleCased(title: string): boolean {
  let candidates = 0;
  let capitals = 0;
  let start = true;
  for (const raw of title.replace(/\*/g, '').split(/\s+/)) {
    const word = raw.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
    if (!start && word.length >= 4 && /^\p{L}+$/u.test(word)) {
      candidates++;
      if (/^\p{Lu}\p{Ll}/u.test(word)) capitals++;
    }
    start = /[:?!—]$/.test(raw);
  }
  return candidates >= 2 && capitals / candidates > 0.5;
}

/** Written all in capitals (six letters or more): names and titles APA writes as they normally appear. */
export const shouting = (value: string) =>
  (value.match(/\p{L}/gu)?.length ?? 0) >= 6 && !/\p{Ll}/u.test(value);

/** A sentence of a reference: a full stop added unless it ends in one, or in ? or !; inside a closing quote. */
export function sentence(part: string): string {
  if (/[.?!]$/.test(part)) return part;
  const quoted = /^(.*[^.?!])([”’"']+)$/.exec(part);
  if (quoted) return `${quoted[1]}.${quoted[2]}`;
  return `${part}.`;
}

/** An italic title, then anything in brackets, then the full stop (a ? or ! inside the italics ends it). */
export function italicSentence(title: string, bracket?: string): string {
  const after = bracket ? ` [${bracket}]` : '';
  if (/[?!]$/.test(title) && !bracket) return `*${title}*`;
  return `*${title}*${after}.`;
}

// ----- people -----

/** APA initials: "Jonathan F." → "J. F."; "Anne-Sophie" → "A.-S."; "J.F." → "J. F.". */
export function initials(given: string): string {
  return given
    .replace(/\.(?=[^\s-])/g, '. ')
    .split(/\s+/)
    .map((token) =>
      token
        .split('-')
        .map((part) => part.match(/\p{L}/u)?.[0])
        .filter((letter): letter is string => letter !== undefined)
        .map((letter) => `${letter.toLocaleUpperCase()}.`)
        .join('-'),
    )
    .filter(Boolean)
    .join(' ');
}

/** "Lawrence, M." (inverted, for authors) or "M. Lawrence" (for editors in a chapter's reference). */
export function personName(p: Person, inverted: boolean): string {
  if (p.family) {
    const ini = p.given ? initials(p.given) : '';
    const suffix = p.suffix ? `${inverted ? ',' : ''} ${p.suffix}` : '';
    return inverted
      ? `${p.family}${ini ? `, ${ini}` : ''}${suffix}`
      : `${ini ? `${ini} ` : ''}${p.family}${suffix}`;
  }
  return (p.name ?? p.given) as string;
}

/** APA's author list: "A, & B"; "A, B, & C"; up to 20, then the first 19, ". . ." and the last. */
export function authorList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  const last = names.at(-1) as string;
  if (names.length <= 20) return `${names.slice(0, -1).join(', ')}, & ${last}`;
  return `${names.slice(0, 19).join(', ')}, . . . ${last}`;
}

/** Editors before a book title: "A. Editor", "A. Editor & B. Editor", "A. Editor, B. Editor, & C. Editor". */
export function editorList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, & ${names.at(-1)}`;
}

const surname = (p: Person) => (p.family ?? p.name ?? p.given) as string;

export function inTextLabel(people: Person[], year: string): string | undefined {
  const [a, b] = people;
  if (!a) return undefined;
  if (people.length === 1) return `${surname(a)} (${year})`;
  if (people.length === 2 && b) return `${surname(a)} and ${surname(b)} (${year})`;
  return `${surname(a)} et al. (${year})`;
}

/** A Creative Commons licence by its name, from its address; anything else is not named. */
export function licenceName(url: string): string | undefined {
  const cc = /creativecommons\.org\/licenses\/([a-z-]+)\/(\d+(?:\.\d+)?)/i.exec(url);
  if (cc) return `CC ${(cc[1] as string).toUpperCase()} ${cc[2]}`;
  const zero = /creativecommons\.org\/publicdomain\/zero\/(\d+(?:\.\d+)?)/i.exec(url);
  if (zero) return `CC0 ${zero[1]}`;
  const mark = /creativecommons\.org\/publicdomain\/mark\/(\d+(?:\.\d+)?)/i.exec(url);
  if (mark) return `Public Domain Mark ${mark[1]}`;
  return undefined;
}

/** 2nd, 3rd, 11th, 21st. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}
