// A DataCite record (https://api.datacite.org/dois/<doi>) as an APA 7 reference: the same kind of draft as
// Crossref's, for the DOIs DataCite registers (data sets, software, collections and supplements, preprints
// in repositories). Nothing is guessed: what the record does not give is left out and named; capitals and
// quotation marks are kept as the record writes them.
import {
  authorList,
  capitalizeSubtitles,
  type DraftNote,
  inTextLabel,
  isObject,
  italicSentence,
  type Json,
  licenceName,
  looksTitleCased,
  type Person,
  personName,
  type ReferenceDraft,
  sentence,
  shouting,
  text,
} from './apa.ts';

/** What APA writes in brackets after the title, by DataCite's general resource type. */
const BRACKETS: Record<string, string> = {
  Dataset: 'Data set',
  Software: 'Computer software',
  ComputationalNotebook: 'Computer software',
  Collection: 'Collection',
  Preprint: 'Preprint',
};

/**
 * DataCite's creators: a personal name as family and given names (or "Family, Given" when only that is
 * given); an organisation, or a name the record does not split, as written.
 */
function readCreators(value: unknown): { people: Person[]; unnamed: number } {
  const people: Person[] = [];
  let unnamed = 0;
  for (const c of Array.isArray(value) ? value.filter(isObject) : []) {
    const name = text(c.name);
    const family = text(c.familyName);
    const given = text(c.givenName);
    const organisation = c.nameType === 'Organizational';
    if (!organisation && family) people.push({ family, ...(given ? { given } : {}) });
    else if (!organisation && name && name.includes(',')) {
      const [f, ...rest] = name.split(',');
      const g = rest.join(',').trim();
      people.push({ family: (f as string).trim(), ...(g ? { given: g } : {}) });
    } else if (name) people.push({ name });
    else unnamed++;
  }
  return { people, unnamed };
}

/** The licence the record gives: a Creative Commons licence by its address, or one named by an SPDX id. */
function pickLicence(work: Json, notes: DraftNote[]): string | undefined {
  const named = new Set<string>();
  const other: string[] = [];
  for (const r of Array.isArray(work.rightsList) ? work.rightsList.filter(isObject) : []) {
    const uri = text(r.rightsUri) ?? '';
    const rights = text(r.rights);
    const cc = licenceName(uri);
    if (cc) named.add(cc);
    else if (r.rightsIdentifierScheme === 'SPDX' && rights) named.add(rights);
    else if (rights) other.push(rights);
    // An entry without words, such as info:eu-repo/semantics/openAccess, says who may read it, not a licence.
  }
  if (named.size === 1) return [...named][0];
  if (named.size > 1 || other.length) {
    notes.push({
      level: 'check',
      message: `DataCite records rights that are not one named licence (${[...named, ...other].join('; ')}), so no licence is filled in.`,
    });
  }
  return undefined;
}

/** Other works the record links: what this one supplements, is a version or a part of. */
function readRelations(work: Json, notes: DraftNote[]): void {
  const said: Record<string, string> = {
    IsSupplementTo: 'a supplement to',
    IsVersionOf: 'a version of',
    IsPartOf: 'part of',
    IsPreviousVersionOf: 'an earlier version of',
  };
  for (const r of Array.isArray(work.relatedIdentifiers) ? work.relatedIdentifiers.filter(isObject) : []) {
    const relation = typeof r.relationType === 'string' ? said[r.relationType] : undefined;
    const target = text(r.relatedIdentifier);
    if (!relation || !target) continue;
    const doi = r.relatedIdentifierType === 'DOI';
    notes.push({
      level: 'check',
      message: `DataCite records this as ${relation} ${target}${
        r.relationType === 'IsSupplementTo' && doi
          ? ': if that work is in the library, make this a supplement of it'
          : r.relationType === 'IsVersionOf'
            ? ': cite the version you used'
            : ''
      }.`,
    });
  }
}

/**
 * An APA 7 draft from a DataCite record (the `data.attributes` of DataCite's reply). `askedDoi` is used when
 * the record does not carry its DOI.
 */
export function referenceFromDataCite(work: Json, askedDoi = ''): ReferenceDraft {
  const notes: DraftNote[] = [];
  const doi = text(work.doi) ?? askedDoi;
  const types = isObject(work.types) ? work.types : {};
  const type = text(types.resourceTypeGeneral) ?? 'Other';
  const named = text(types.resourceType);
  const creators = readCreators(work.creators);
  if (creators.unnamed) {
    notes.push({
      level: 'missing',
      message: `DataCite lists ${creators.unnamed === 1 ? 'a creator' : `${creators.unnamed} creators`} without a name; ${creators.unnamed === 1 ? 'it is' : 'they are'} left out.`,
    });
  }

  const year = text(String(work.publicationYear ?? '')) ?? '';
  const dated = /^\d{4}$/.test(year) ? year : 'n.d.';
  if (dated === 'n.d.') {
    notes.push({
      level: 'missing',
      message: 'DataCite gives no year of publication, so the reference says (n.d.).',
    });
  }

  // The main title (no titleType), then a subtitle.
  const titles = Array.isArray(work.titles) ? work.titles.filter(isObject) : [];
  const main = text(titles.find((t) => t.titleType === undefined)?.title ?? titles[0]?.title);
  const subtitle = text(titles.find((t) => t.titleType === 'Subtitle')?.title);
  let title = main?.replace(/\s+:/g, ':');
  if (title && subtitle && !title.toLowerCase().includes(subtitle.toLowerCase()))
    title = `${title}: ${subtitle}`;
  if (title) {
    if (looksTitleCased(title)) {
      notes.push({
        level: 'check',
        message:
          'DataCite writes the title with most words capitalized. APA writes it in sentence case (capitals for the first word, the first word after a colon, and proper nouns only); Loopweft cannot tell proper nouns, so it keeps DataCite’s capitals: correct them by hand.',
      });
    }
    if (/^\[?\s*(withdrawn|retracted)\b/i.test(title)) {
      notes.push({
        level: 'warning',
        message: 'The title says this work was withdrawn or retracted. Read why before citing it.',
      });
    }
    title = capitalizeSubtitles(title);
  } else {
    notes.push({ level: 'missing', message: 'DataCite gives no title.' });
  }

  const publisherField = work.publisher;
  const publisher = isObject(publisherField) ? text(publisherField.name) : text(publisherField);
  for (const p of creators.people) {
    if (p.family && shouting(p.family)) {
      notes.push({
        level: 'check',
        message: `DataCite writes the name “${p.family}” in capitals; APA writes names as they normally appear.`,
      });
    }
  }
  if (publisher && shouting(publisher)) {
    notes.push({
      level: 'check',
      message: `DataCite writes the publisher in capitals (“${publisher}”); APA writes names as they normally appear.`,
    });
  }

  const rawVersion = text(work.version);
  const version = rawVersion?.replace(/^v(?:ersion)?\.?\s*(?=\d)/i, '');
  const thesis =
    type === 'Dissertation' || (type === 'Text' && named !== undefined && /dissertation|thesis/i.test(named));
  const bracket = thesis ? `Dissertation${publisher ? `, ${publisher}` : ''}` : BRACKETS[type];
  if (thesis) {
    notes.push({
      level: 'missing',
      message:
        'APA writes “Doctoral dissertation” or “Master’s thesis” in the brackets, with the institution; DataCite does not say which, so the brackets say “Dissertation” and its publisher: correct them.',
    });
  }

  const parts: string[] = [];
  const lead = creators.people;
  const date = `(${dated}).`;
  if (lead.length) parts.push(sentence(authorList(lead.map((p) => personName(p, true)))), date);
  else if (title) {
    notes.push({
      level: 'missing',
      message:
        'DataCite lists no creator, so the reference starts with the title. If an organisation made the work, APA names it as the author.',
    });
  }
  if (title) {
    const titled = version
      ? `*${title}* (Version ${version})${bracket ? ` [${bracket}]` : ''}.`
      : italicSentence(title, bracket);
    parts.push(titled);
  }
  if (!lead.length) parts.push(date);
  // APA leaves the publisher out when it is also the author.
  const sameAsAuthor = lead.length === 1 && lead[0]?.name !== undefined && lead[0].name === publisher;
  if (publisher && !sameAsAuthor) parts.push(sentence(publisher));
  if (!publisher) notes.push({ level: 'missing', message: 'DataCite gives no publisher.' });
  if (doi) parts.push(`https://doi.org/${doi}`);

  if (!BRACKETS[type] && !thesis) {
    notes.push({
      level: 'check',
      message: `DataCite calls this “${type}${named && named !== type ? `: ${named}` : ''}”: Loopweft writes it as a stand-alone work, so check it against APA’s rules for that kind of work${
        type === 'Text' && named && /article/i.test(named)
          ? ' (a journal article is cited with its journal; if it has a DOI from the journal, cite that instead)'
          : ''
      }.`,
    });
  }
  readRelations(work, notes);
  const licence = pickLicence(work, notes);
  const label = inTextLabel(lead, dated);
  return {
    doi,
    apa: parts.join(' '),
    ...(label ? { label } : {}),
    ...(licence ? { licence } : {}),
    agency: 'DataCite',
    type,
    year: dated,
    notes,
  };
}
