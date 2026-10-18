// A Crossref work record (https://api.crossref.org/works/<doi>) as an APA 7 reference: a draft for a person
// to check before it becomes a source, with notes on what Crossref did not say and what to check. Nothing
// is guessed: a part Crossref does not give is left out and named; capitals are kept as Crossref writes them
// (Loopweft cannot tell a proper noun), except the first word after a colon, which APA always capitalizes.
// The rules followed are those of the APA Publication Manual (7th ed.), chapters 9 and 10.

/** `warning`: read before citing (a retraction). `missing`: a part APA wants that Crossref lacks. `check`: verify. */
export type NoteLevel = 'warning' | 'missing' | 'check';

export interface DraftNote {
  level: NoteLevel;
  message: string;
}

export interface ReferenceDraft {
  /** The DOI as Crossref writes it. */
  doi: string;
  /** The APA 7 reference, `*asterisks*` marking italics. */
  apa: string;
  /** The in-text form, e.g. "Lawrence et al. (2024)", when the work has authors or editors. */
  label?: string;
  /** A Creative Commons licence the publisher recorded with Crossref, by its name. */
  licence?: string;
  /** Crossref's name for the kind of work, e.g. `journal-article`. */
  type: string;
  /** The year the reference gives, or `n.d.`. */
  year: string;
  notes: DraftNote[];
}

type Json = Record<string, unknown>;

interface Person {
  given?: string;
  family?: string;
  name?: string;
  suffix?: string;
}

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// ----- text -----

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

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

const text = (value: unknown, markItalics = false): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const cleaned = plain(value, markItalics);
  return cleaned || undefined;
};

/** The first non-empty text of a Crossref list such as `title` or `container-title`. */
const firstText = (value: unknown, markItalics = false): string | undefined => {
  if (!Array.isArray(value)) return text(value, markItalics);
  for (const item of value) {
    const t = text(item, markItalics);
    if (t) return t;
  }
  return undefined;
};

/** Page and issue ranges with an en dash: 526-549 becomes 526–549. */
const ranged = (value: string) => value.replace(/\s*[-‐‑‒–—]+\s*/g, '–');

/** The first word after a colon, question mark or em dash capitalized, when it is written all in lower case. */
const capitalizeSubtitles = (title: string) =>
  title.replace(
    /([:?!—]\s+)(\*?)(\p{Ll}+)(?=[\s,.;:?!*]|$)/gu,
    (_, gap: string, star: string, word: string) =>
      `${gap}${star}${word.charAt(0).toLocaleUpperCase()}${word.slice(1)}`,
  );

/** True when most longer words after the first are capitalized, as in title case. */
function looksTitleCased(title: string): boolean {
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
const shouting = (value: string) => (value.match(/\p{L}/gu)?.length ?? 0) >= 6 && !/\p{Ll}/u.test(value);

/** A sentence of a reference: a full stop added unless it ends in one, or in ? or !; inside a closing quote. */
function sentence(part: string): string {
  if (/[.?!]$/.test(part)) return part;
  const quoted = /^(.*[^.?!])([”’"']+)$/.exec(part);
  if (quoted) return `${quoted[1]}.${quoted[2]}`;
  return `${part}.`;
}

/** An italic title, then anything in brackets, then the full stop (a ? or ! inside the italics ends it). */
function italicSentence(title: string, bracket?: string): string {
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

function readPeople(value: unknown): { people: Person[]; unnamed: number } {
  if (!Array.isArray(value)) return { people: [], unnamed: 0 };
  const entries = value.filter(isObject);
  // Crossref marks the first author; the others keep their order.
  const ordered = [
    ...entries.filter((p) => p.sequence === 'first'),
    ...entries.filter((p) => p.sequence !== 'first'),
  ];
  const people: Person[] = [];
  let unnamed = 0;
  for (const p of ordered) {
    const person: Person = {};
    for (const key of ['given', 'family', 'name', 'suffix'] as const) {
      const t = text(p[key]);
      if (t) person[key] = t;
    }
    if (person.family || person.name || person.given) people.push(person);
    else unnamed++;
  }
  return { people, unnamed };
}

/** "Lawrence, M." (inverted, for authors) or "M. Lawrence" (for editors in a chapter's reference). */
function personName(p: Person, inverted: boolean): string {
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
function authorList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  const last = names.at(-1) as string;
  if (names.length <= 20) return `${names.slice(0, -1).join(', ')}, & ${last}`;
  return `${names.slice(0, 19).join(', ')}, . . . ${last}`;
}

/** Editors before a book title: "A. Editor", "A. Editor & B. Editor", "A. Editor, B. Editor, & C. Editor". */
function editorList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, & ${names.at(-1)}`;
}

const surname = (p: Person) => (p.family ?? p.name ?? p.given) as string;

function inTextLabel(people: Person[], year: string): string | undefined {
  const [a, b] = people;
  if (!a) return undefined;
  if (people.length === 1) return `${surname(a)} (${year})`;
  if (people.length === 2 && b) return `${surname(a)} and ${surname(b)} (${year})`;
  return `${surname(a)} et al. (${year})`;
}

// ----- dates, licences, updates -----

function yearOf(value: unknown): number | undefined {
  if (!isObject(value) || !Array.isArray(value['date-parts'])) return undefined;
  const first = value['date-parts'][0];
  const year = Array.isArray(first) ? first[0] : undefined;
  return typeof year === 'number' && Number.isInteger(year) && year >= 1000 && year <= 9999
    ? year
    : undefined;
}

function dayOf(value: unknown): string | undefined {
  if (!isObject(value) || !Array.isArray(value['date-parts'])) return undefined;
  const parts = value['date-parts'][0];
  if (!Array.isArray(parts) || typeof parts[0] !== 'number') return undefined;
  return parts
    .filter((n): n is number => typeof n === 'number')
    .map((n, i) => (i === 0 ? String(n) : String(n).padStart(2, '0')))
    .join('-');
}

/**
 * The year of a reference. For a journal article in an issue, the issue's year (APA gives the year of the
 * issue once a work is in one); otherwise the date Crossref calls `issued`, the earliest it knows.
 */
function pickYear(work: Json, type: string, notes: DraftNote[]): string {
  const issued = yearOf(work.issued);
  if (type === 'journal-article') {
    const issue = isObject(work['journal-issue']) ? work['journal-issue'] : {};
    const issueYear =
      yearOf(work['published-print']) ??
      yearOf(issue['published-print']) ??
      yearOf(issue['published-online']);
    if (issueYear !== undefined) {
      const online = yearOf(work['published-online']) ?? issued;
      if (online !== undefined && online !== issueYear) {
        notes.push({
          level: 'check',
          message: `The year is the issue's (${issueYear}); Crossref records the work online in ${online}. APA gives the year of the issue once a work is in one.`,
        });
      }
      return String(issueYear);
    }
  }
  if (issued !== undefined) return String(issued);
  notes.push({
    level: 'missing',
    message: 'Crossref gives no date of publication, so the reference says (n.d.).',
  });
  return 'n.d.';
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

/** The licence of the published version, when Crossref records exactly one Creative Commons licence for it. */
function pickLicence(work: Json, notes: DraftNote[]): string | undefined {
  const entries = (Array.isArray(work.license) ? work.license : [])
    .filter(isObject)
    .filter((l) => l['content-version'] === 'vor' || l['content-version'] === 'unspecified')
    .map((l) => (typeof l.URL === 'string' ? l.URL : ''))
    .filter(Boolean);
  if (entries.length === 0) return undefined;
  const names = new Set(entries.map((url) => licenceName(url)));
  if (names.size === 1 && !names.has(undefined)) return [...names][0];
  notes.push({
    level: 'check',
    message: `Crossref links licence terms that are not one Creative Commons licence (${[...new Set(entries)].join(', ')}), so no licence is filled in.`,
  });
  return undefined;
}

const SERIOUS: Record<string, string> = {
  retraction: 'a retraction',
  partial_retraction: 'a partial retraction',
  withdrawal: 'a withdrawal',
  removal: 'a removal',
  expression_of_concern: 'an expression of concern',
};
const MINOR: Record<string, string> = {
  correction: 'a correction',
  erratum: 'an erratum',
  corrigendum: 'a corrigendum',
  addendum: 'an addendum',
  clarification: 'a clarification',
};

/** Retractions, corrections and other notices that Crossref links to the work. */
function readUpdates(work: Json, doi: string, notes: DraftNote[]): void {
  const describe = (u: Json) => {
    const type = typeof u.type === 'string' ? u.type : 'update';
    const date = dayOf(u.updated);
    const ref = `${typeof u.DOI === 'string' ? u.DOI : 'no DOI'}${date ? `, ${date}` : ''}`;
    return { type, ref };
  };
  for (const u of (Array.isArray(work['updated-by']) ? work['updated-by'] : []).filter(isObject)) {
    const { type, ref } = describe(u);
    if (SERIOUS[type]) {
      notes.push({
        level: 'warning',
        message: `Crossref records ${SERIOUS[type]} of this work (${ref}). Read it before citing the work.`,
      });
    } else if (MINOR[type]) {
      notes.push({
        level: 'check',
        message: `Crossref records ${MINOR[type]} to this work (${ref}): check whether it changes what the map cites.`,
      });
    } else {
      notes.push({ level: 'check', message: `Crossref records an update to this work (${type}, ${ref}).` });
    }
  }
  for (const u of (Array.isArray(work['update-to']) ? work['update-to'] : []).filter(isObject)) {
    const { type, ref } = describe(u);
    const target = typeof u.DOI === 'string' ? u.DOI : '';
    const what = SERIOUS[type] ?? MINOR[type] ?? `an update (${type})`;
    if (target.toLowerCase() === doi.toLowerCase()) {
      notes.push({
        level: SERIOUS[type] ? 'warning' : 'check',
        message: `Crossref marks this work with ${what} (${ref}). Read it before citing the work.`,
      });
    } else {
      notes.push({
        level: 'warning',
        message: `This DOI is the notice of ${what} for ${ref}, not that work itself.`,
      });
    }
  }
}

// ----- the reference -----

const BOOKS = new Set(['book', 'monograph', 'edited-book', 'reference-book', 'book-set', 'book-series']);
const CHAPTERS = new Set(['book-chapter', 'book-section', 'book-part', 'reference-entry', 'book-track']);

/** 2nd, 3rd, 11th, 21st. */
function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/**
 * An APA 7 draft from a Crossref work record (the `message` of Crossref's reply). `askedDoi` is used when
 * the record does not carry its DOI.
 */
export function referenceFromCrossref(work: Json, askedDoi = ''): ReferenceDraft {
  const notes: DraftNote[] = [];
  const doi = typeof work.DOI === 'string' && work.DOI ? work.DOI : askedDoi;
  const type = typeof work.type === 'string' ? work.type : 'other';
  const authors = readPeople(work.author);
  const editors = readPeople(work.editor);
  if (authors.unnamed || editors.unnamed) {
    const n = authors.unnamed + editors.unnamed;
    notes.push({
      level: 'missing',
      message: `Crossref lists ${n === 1 ? 'a person' : `${n} people`} without a name; ${n === 1 ? 'it is' : 'they are'} left out.`,
    });
  }
  const year = pickYear(work, type, notes);
  const book = BOOKS.has(type);
  const chapter = CHAPTERS.has(type);

  // Article and chapter titles are set in roman, so their own italics are marked; other titles are italic.
  const romanTitle = type === 'journal-article' || type === 'proceedings-article' || chapter;
  const mainTitle = firstText(work.title, romanTitle);
  const subtitle = firstText(work.subtitle, romanTitle);
  let title = mainTitle;
  if (title && subtitle && !title.toLowerCase().includes(subtitle.toLowerCase()))
    title = `${title}: ${subtitle}`;
  if (title) {
    if (looksTitleCased(title)) {
      notes.push({
        level: 'check',
        message:
          'Crossref writes the title with most words capitalized. APA writes it in sentence case (capitals for the first word, the first word after a colon, and proper nouns only); Loopweft cannot tell proper nouns, so it keeps Crossref’s capitals: correct them by hand.',
      });
    }
    title = capitalizeSubtitles(title);
  } else {
    notes.push({ level: 'missing', message: 'Crossref gives no title.' });
  }

  const container = firstText(work['container-title']);
  const publisher = text(work.publisher);
  const volume = text(work.volume);
  const issue = text(work.issue);
  const page = text(work.page);
  const articleNumber = text(work['article-number']);
  const institution = Array.isArray(work.institution)
    ? work.institution
        .filter(isObject)
        .map((i) => text(i.name))
        .find(Boolean)
    : undefined;

  for (const [what, value] of [
    ['publisher', publisher],
    ['container', container],
  ] as const) {
    if (value && shouting(value)) {
      notes.push({
        level: 'check',
        message: `Crossref writes the ${what === 'container' ? 'journal or book' : 'publisher'} in capitals (“${value}”); APA writes names as they normally appear.`,
      });
    }
  }
  for (const p of [...authors.people, ...editors.people]) {
    if (p.family && shouting(p.family)) {
      notes.push({
        level: 'check',
        message: `Crossref writes the name “${p.family}” in capitals; APA writes names as they normally appear.`,
      });
    }
  }

  // Who comes first: the authors; for a book without authors, its editors; otherwise the title.
  const parts: string[] = [];
  let lead: Person[] = authors.people;
  const editorsLead = lead.length === 0 && book && editors.people.length > 0;
  if (editorsLead) lead = editors.people;
  const dated = `(${year}).`;
  if (lead.length) {
    const names = authorList(lead.map((p) => personName(p, true)));
    const role = editorsLead ? ` (${editors.people.length === 1 ? 'Ed.' : 'Eds.'})` : '';
    parts.push(editorsLead ? `${names}${role}.` : sentence(names), dated);
  } else if (title) {
    notes.push({
      level: 'missing',
      message:
        'Crossref lists no author, so the reference starts with the title. If an organisation wrote the work, APA names it as the author.',
    });
  }

  const missing = (what: string) => notes.push({ level: 'missing', message: `Crossref gives no ${what}.` });
  const roman = (t: string | undefined) => (t ? sentence(t) : undefined);
  const italic = (t: string | undefined, bracket?: string) =>
    t ? italicSentence(t, bracket) : bracket ? `[${bracket}].` : undefined;
  const push = (...items: (string | undefined)[]) => {
    for (const item of items) if (item) parts.push(item);
  };
  /** A title-led reference puts its date after the title. */
  const titled = (titlePart: string | undefined) => {
    push(titlePart);
    if (!lead.length) parts.push(dated);
  };

  if (type === 'journal-article' || (type === 'proceedings-article' && volume)) {
    titled(roman(title));
    if (!container) missing('journal name');
    let source = container ? `*${container}*` : '';
    if (volume) source += `${source ? ', ' : ''}*${volume}*`;
    else if (type === 'journal-article') missing('volume');
    if (issue) source += `(${ranged(issue)})`;
    const locator = articleNumber ? `Article ${articleNumber}` : page ? ranged(page) : undefined;
    if (locator) source += `${source ? ', ' : ''}${locator}`;
    else missing('pages or article number');
    if (source) parts.push(`${source}.`);
    if (type === 'proceedings-article') {
      notes.push({
        level: 'check',
        message:
          'A conference paper: APA writes one published in a journal or a numbered series like a journal article (as here), and one in an edited book like a chapter.',
      });
    }
  } else if (chapter || type === 'proceedings-article') {
    titled(roman(title));
    const eds = editors.people.map((p) => personName(p, false));
    const pages = page ? ` (${/[–-]/.test(ranged(page)) ? 'pp.' : 'p.'} ${ranged(page)})` : '';
    const inBook = container
      ? `In ${eds.length ? `${editorList(eds)} (${eds.length === 1 ? 'Ed.' : 'Eds.'}), ` : ''}*${container}*${pages}.`
      : undefined;
    if (container && looksTitleCased(container)) {
      notes.push({
        level: 'check',
        message:
          'Crossref writes the book’s title with most words capitalized; APA writes it in sentence case too.',
      });
    }
    if (!container) missing(type === 'proceedings-article' ? 'name of the proceedings' : 'book title');
    else if (!eds.length) {
      notes.push({
        level: 'missing',
        message:
          'Crossref lists no editors of the book. If it has any, APA names them: “In A. Editor (Ed.), …”.',
      });
    }
    if (!page) missing('page range');
    push(inBook, publisher ? sentence(publisher) : undefined);
    if (!publisher) missing('publisher');
  } else if (book) {
    const edition = Number(text(work['edition-number']));
    const ed = Number.isInteger(edition) && edition >= 2 ? ` (${ordinal(edition)} ed.)` : '';
    titled(title ? (ed ? `*${title}*${ed}.` : italic(title)) : undefined);
    push(publisher ? sentence(publisher) : undefined);
    if (!publisher) missing('publisher');
    if (type === 'edited-book' && !editors.people.length && !authors.people.length) missing('editors');
    if (container && type !== 'book-series') {
      notes.push({
        level: 'check',
        message: `Crossref calls this ${type === 'edited-book' ? 'an edited book' : 'a book'} within “${container}”: if it is a chapter, APA writes it as one (“In … (Ed.), *Book*”).`,
      });
    }
  } else if (type === 'report' || type === 'report-component') {
    titled(italic(title));
    push(publisher ? sentence(publisher) : undefined);
    if (!publisher) missing('publisher');
    notes.push({
      level: 'check',
      message: 'APA adds a report’s number after its title when it has one: “(Report No. 12)”.',
    });
  } else if (type === 'posted-content') {
    const subtype = typeof work.subtype === 'string' ? work.subtype : '';
    titled(italic(title, subtype === 'preprint' ? 'Preprint' : undefined));
    const where = text(work['group-title']) ?? institution ?? publisher;
    push(where ? sentence(where) : undefined);
    if (!where) missing('repository or publisher');
    if (subtype !== 'preprint') {
      notes.push({
        level: 'check',
        message: `Crossref calls this posted content${subtype ? ` (${subtype})` : ''}: add what kind of work it is in brackets after the title, as APA does (e.g. [Preprint]).`,
      });
    }
  } else if (type === 'dissertation') {
    titled(italic(title, institution ? `Dissertation, ${institution}` : 'Dissertation'));
    push(publisher ? sentence(publisher) : undefined);
    notes.push({
      level: 'missing',
      message:
        'APA writes “Doctoral dissertation” or “Master’s thesis” in the brackets; Crossref does not say which, so the brackets say “Dissertation”: correct it.',
    });
    if (!institution) missing('institution');
  } else if (type === 'dataset') {
    titled(italic(title, 'Data set'));
    push(publisher ? sentence(publisher) : undefined);
    if (!publisher) missing('publisher');
    notes.push({
      level: 'check',
      message:
        'Crossref calls this a dataset: APA writes [Data set] for data and [Computer software] for software.',
    });
  } else {
    titled(italic(title));
    const where = container ?? publisher;
    push(where ? sentence(where) : undefined);
    notes.push({
      level: 'check',
      message: `Crossref calls this “${type}”: Loopweft writes it as a stand-alone work, so check it against APA’s rules for that kind of work.`,
    });
  }
  if (doi) parts.push(`https://doi.org/${doi}`);
  readUpdates(work, doi, notes);

  const licence = pickLicence(work, notes);
  const label = inTextLabel(lead, year);
  return {
    doi,
    apa: parts.join(' '),
    ...(label ? { label } : {}),
    ...(licence ? { licence } : {}),
    type,
    year,
    notes,
  };
}
