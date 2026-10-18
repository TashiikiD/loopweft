// A Crossref work record (https://api.crossref.org/works/<doi>) as an APA 7 reference: a draft for a person
// to check before it becomes a source, with notes on what Crossref did not say and what to check. Nothing
// is guessed: a part Crossref does not give is left out and named; capitals are kept as Crossref writes them
// (Loopweft cannot tell a proper noun), except the first word after a colon, which APA always capitalizes.
// The rules followed are those of the APA Publication Manual (7th ed.), chapters 9 and 10.

import {
  authorList,
  capitalizeSubtitles,
  type DraftNote,
  editorList,
  firstText,
  inTextLabel,
  isObject,
  italicSentence,
  type Json,
  licenceName,
  looksTitleCased,
  ordinal,
  type Person,
  personName,
  type ReferenceDraft,
  ranged,
  sentence,
  shouting,
  text,
} from './apa.ts';

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
    agency: 'Crossref',
    type,
    year,
    notes,
  };
}
