// The DOI lookup without the network: Crossref's replies were recorded once (fixtures/crossref, see its
// README) and every test answers from them.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CROSSREF_WORKS,
  crossrefUrl,
  DATACITE_DOIS,
  dataciteUrl,
  initials,
  licenceName,
  lookupDoi,
  readDoi,
  readProject,
  referenceFromCrossref,
  referenceFromDataCite,
} from '../src/index.ts';
import { repoFile } from './helpers.ts';

const FIXTURES = new URL('./fixtures/crossref/', import.meta.url);
const DATACITE = new URL('./fixtures/datacite/', import.meta.url);
const fixtureName = (doi: string) => `${doi.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.json`;
type Recorded = {
  message?: Record<string, unknown>;
  data?: { attributes: Record<string, unknown> };
  status?: number | string;
  text?: string;
};
const recorded = (doi: string, folder = FIXTURES) =>
  JSON.parse(readFileSync(new URL(fixtureName(doi), folder), 'utf8')) as Recorded;

/** A fetch that answers Crossref and DataCite from their recorded replies, and notes what it was asked. */
function recordedFetch() {
  const asked: { url: string; init?: RequestInit }[] = [];
  const fake = (async (url: string | URL | Request, init?: RequestInit) => {
    asked.push({ url: String(url), init });
    const fromDataCite = String(url).startsWith(DATACITE_DOIS);
    const doi = decodeURIComponent(String(url).slice((fromDataCite ? DATACITE_DOIS : CROSSREF_WORKS).length));
    const folder = fromDataCite ? DATACITE : FIXTURES;
    if (!existsSync(new URL(fixtureName(doi), folder))) return new Response('Not found', { status: 404 });
    const body = recorded(doi, folder);
    // A recorded failure holds its HTTP status; a recorded Crossref work, Crossref's own "status": "ok".
    if (typeof body.status === 'number') return new Response(body.text ?? '', { status: body.status });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  return { fetch: fake, asked };
}

describe('reading a DOI', () => {
  it('takes a bare DOI, an address or a doi: prefix', () => {
    for (const text of [
      '10.1017/sus.2024.1',
      ' https://doi.org/10.1017/sus.2024.1 ',
      'http://dx.doi.org/10.1017/sus.2024.1',
      'doi.org/10.1017/sus.2024.1',
      'doi:10.1017/sus.2024.1',
      'DOI: 10.1017/sus.2024.1',
      '<https://doi.org/10.1017/sus.2024.1>',
      'https://doi.org/10.1017%2Fsus.2024.1',
      '10.1017/sus.2024.1.',
    ]) {
      expect(readDoi(text), text).toBe('10.1017/sus.2024.1');
    }
  });

  it('refuses what is not a DOI', () => {
    for (const text of [
      '',
      'sus.2024.1',
      '10.1/x',
      '10.1017 /sus',
      'https://example.org/10.1017/x',
      '%E0%A4%A',
    ]) {
      expect(readDoi(text), text).toBeNull();
    }
  });
});

describe('APA parts', () => {
  it('writes initials as APA does', () => {
    expect(initials('Jonathan F.')).toBe('J. F.');
    expect(initials('R. E. V.')).toBe('R. E. V.');
    expect(initials('J.F.')).toBe('J. F.');
    expect(initials('Anne-Sophie')).toBe('A.-S.');
    expect(initials('A.-S.')).toBe('A.-S.');
    expect(initials('Jean-Claude Marie')).toBe('J.-C. M.');
    expect(initials('Øystein')).toBe('Ø.');
  });

  it('names Creative Commons licences only', () => {
    expect(licenceName('http://creativecommons.org/licenses/by/4.0/')).toBe('CC BY 4.0');
    expect(licenceName('https://creativecommons.org/licenses/by-nc-nd/3.0/legalcode')).toBe(
      'CC BY-NC-ND 3.0',
    );
    expect(licenceName('https://creativecommons.org/publicdomain/zero/1.0/')).toBe('CC0 1.0');
    expect(licenceName('https://www.springernature.com/gp/researchers/text-and-data-mining')).toBeUndefined();
  });
});

describe('references from Crossref', () => {
  it('drafts every recorded work as the saved file shows', async () => {
    const files = readdirSync(FIXTURES)
      .filter((f) => f.endsWith('.json'))
      .sort();
    const sections: string[] = [];
    for (const file of files) {
      const body = JSON.parse(readFileSync(new URL(file, FIXTURES), 'utf8'));
      if (!body.message) continue;
      const draft = referenceFromCrossref(body.message);
      sections.push(
        [
          `## ${draft.doi} (${draft.type})`,
          '',
          draft.apa,
          '',
          `- label: ${draft.label ?? '(none)'}`,
          `- licence: ${draft.licence ?? '(none)'}`,
          ...draft.notes.map((n) => `- ${n.level}: ${n.message}`),
        ].join('\n'),
      );
    }
    await expect(
      `# References drafted from the recorded Crossref records\n\n${sections.join('\n\n')}\n`,
    ).toMatchFileSnapshot('./expected/crossref-drafts.md');
  });

  it('gives the references of the example, except where they differ for a reason it names', () => {
    const read = readProject(repoFile('examples/polycrisis.loopweft'));
    if (!read.ok) throw new Error('the example does not read');
    const compared: Record<string, string> = {};
    for (const source of read.project.sources) {
      if (!source.doi || source.partOf) continue;
      if (!existsSync(new URL(fixtureName(source.doi), FIXTURES))) {
        compared[source.id] = 'not recorded';
        continue;
      }
      const body = recorded(source.doi);
      if (!body.message) {
        compared[source.id] = `not in Crossref (${body.status})`;
        continue;
      }
      const draft = referenceFromCrossref(body.message);
      compared[source.id] = draft.apa === source.apa ? 'same' : draft.apa;
    }
    expect(compared).toEqual({
      L: 'same',
      // The year of its issue, 2024 (the talk had 2023; corrected at the Phase 3 checkpoint review).
      J: 'same',
      C: 'not recorded',
      G: 'same',
      S: 'same',
      // Crossref writes the title in title case; the example, in APA's sentence case.
      R: 'Liu, H., & Renn, O. (2025). Polycrisis and Systemic Risk: Assessment, Governance, and Communication. *International Journal of Disaster Risk Science*, *16*(4), 526–549. https://doi.org/10.1007/s13753-025-00636-3',
      B: 'same',
      // Crossref quotes the word with single marks; the example, with APA's double marks.
      D: 'Delannoy, L., Leveugle, J.-C., Maniatakou, S., & Søgaard Jørgensen, P. (2026). More than a buzzword? Mapping interpretations of the ‘polycrisis.’ *Sustainability Science*, *21*(3), 1177–1191. https://doi.org/10.1007/s11625-025-01790-9',
      RI: 'same',
    });
  });

  it('marks italics in an article title and writes sub- and superscript digits', () => {
    const draft = referenceFromCrossref({
      DOI: '10.1234/x',
      type: 'journal-article',
      title: ['Growth of <i>Escherichia coli</i> at high CO<sub>2</sub> &amp; 10<sup>6</sup> cells'],
      author: [{ given: 'Ada', family: 'Test', sequence: 'first' }],
      'container-title': ['Journal of <i>Tests</i>'],
      volume: '1',
      page: '1-9',
      issued: { 'date-parts': [[2020, 5]] },
    });
    expect(draft.apa).toBe(
      'Test, A. (2020). Growth of *Escherichia coli* at high CO₂ & 10⁶ cells. *Journal of Tests*, *1*, 1–9. https://doi.org/10.1234/x',
    );
    expect(draft.notes).toEqual([]);
  });

  it('names what Crossref leaves out instead of filling it in', () => {
    const draft = referenceFromCrossref({ DOI: '10.1234/y', type: 'journal-article', title: ['A title'] });
    expect(draft.apa).toBe('A title. (n.d.). https://doi.org/10.1234/y');
    expect(draft.notes.map((n) => `${n.level}: ${n.message}`)).toEqual([
      'missing: Crossref gives no date of publication, so the reference says (n.d.).',
      'missing: Crossref lists no author, so the reference starts with the title. If an organisation wrote the work, APA names it as the author.',
      'missing: Crossref gives no journal name.',
      'missing: Crossref gives no volume.',
      'missing: Crossref gives no pages or article number.',
    ]);
    expect(draft.label).toBeUndefined();
  });

  it('lists 20 authors, and the first 19 and the last of more', () => {
    const people = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        given: 'A',
        family: `F${i + 1}`,
        sequence: i ? 'additional' : 'first',
      }));
    const apa = (n: number) =>
      referenceFromCrossref({
        type: 'book',
        title: ['T'],
        author: people(n),
        publisher: 'P',
        issued: { 'date-parts': [[2001]] },
      }).apa;
    expect(apa(2)).toBe('F1, A., & F2, A. (2001). *T*. P.');
    expect(apa(20)).toContain('F19, A., & F20, A. (2001)');
    expect(apa(21)).toContain('F18, A., F19, A., . . . F21, A. (2001)');
    expect(apa(21)).not.toContain('F20');
  });
});

describe('references from DataCite', () => {
  it('drafts every recorded record as the saved file shows', async () => {
    const files = readdirSync(DATACITE)
      .filter((f) => f.endsWith('.json'))
      .sort();
    const sections: string[] = [];
    for (const file of files) {
      const body = JSON.parse(readFileSync(new URL(file, DATACITE), 'utf8')) as Recorded;
      if (!body.data) continue;
      const draft = referenceFromDataCite(body.data.attributes);
      sections.push(
        [
          `## ${draft.doi} (${draft.type})`,
          '',
          draft.apa,
          '',
          `- label: ${draft.label ?? '(none)'}`,
          `- licence: ${draft.licence ?? '(none)'}`,
          ...draft.notes.map((n) => `- ${n.level}: ${n.message}`),
        ].join('\n'),
      );
    }
    await expect(
      `# References drafted from the recorded DataCite records\n\n${sections.join('\n\n')}\n`,
    ).toMatchFileSnapshot('./expected/datacite-drafts.md');
  });

  it('gives the example’s supplement JS, but for its quotation marks, which DataCite writes straight', () => {
    const read = readProject(repoFile('examples/polycrisis.loopweft'));
    if (!read.ok) throw new Error('the example does not read');
    const js = read.project.sources.find((s) => s.id === 'JS');
    const body = recorded('10.6084/m9.figshare.c.6858564', DATACITE);
    const draft = referenceFromDataCite(body.data?.attributes ?? {});
    expect(draft.apa).not.toBe(js?.apa);
    expect(draft.apa.replace(/"([^"]*)"/, '“$1”')).toBe(js?.apa);
  });

  it('splits a personal name given only as "Family, Given", and keeps an organisation whole', () => {
    const draft = referenceFromDataCite({
      doi: '10.1234/y',
      creators: [
        { name: 'Rakowski, Judith J.', nameType: 'Personal' },
        { name: 'World Health Organization', nameType: 'Organizational' },
      ],
      titles: [{ title: 'Global data : a test' }],
      publisher: { name: 'Zenodo' },
      publicationYear: 2024,
      version: 'v2',
      types: { resourceTypeGeneral: 'Dataset' },
    });
    expect(draft.apa).toBe(
      'Rakowski, J. J., & World Health Organization. (2024). *Global data: A test* (Version 2) [Data set]. Zenodo. https://doi.org/10.1234/y',
    );
    expect(draft.label).toBe('Rakowski and World Health Organization (2024)');
  });
});

describe('looking a DOI up', () => {
  it('asks Crossref for the DOI alone and drafts the reference', async () => {
    const { fetch, asked } = recordedFetch();
    const result = await lookupDoi('https://doi.org/10.1017/sus.2025.14', { fetch });
    expect(result).toEqual({
      ok: true,
      draft: {
        doi: '10.1017/sus.2025.14',
        apa: 'Brosig, M. (2025). How do crises spread? The polycrisis and crisis transmission. *Global Sustainability*, *8*, Article e11. https://doi.org/10.1017/sus.2025.14',
        label: 'Brosig (2025)',
        licence: 'CC BY 4.0',
        agency: 'Crossref',
        type: 'journal-article',
        year: '2025',
        notes: [],
      },
    });
    expect(asked.map((a) => a.url)).toEqual(['https://api.crossref.org/works/10.1017%2Fsus.2025.14']);
    expect(asked[0]?.init?.headers).toEqual({ Accept: 'application/json' });
    expect(crossrefUrl('10.1/a b')).toBe('https://api.crossref.org/works/10.1%2Fa%20b');
  });

  it('says plainly when the DOI is not one, without asking', async () => {
    const { fetch, asked } = recordedFetch();
    const result = await lookupDoi('sus.2024.1', { fetch });
    expect(result).toEqual({
      ok: false,
      failure: {
        kind: 'invalidDoi',
        message:
          '“sus.2024.1” is not a DOI. A DOI starts with 10., a number and a slash, e.g. 10.1017/sus.2024.1.',
      },
    });
    expect(asked).toEqual([]);
  });

  it('asks DataCite when Crossref has no record, as for the example’s supplement', async () => {
    const { fetch, asked } = recordedFetch();
    const result = await lookupDoi('10.6084/m9.figshare.c.6858564', { fetch });
    expect(result).toMatchObject({
      ok: true,
      draft: {
        doi: '10.6084/m9.figshare.c.6858564',
        agency: 'DataCite',
        type: 'Collection',
        label: 'Søgaard Jørgensen et al. (2023)',
        licence: 'CC BY 4.0',
      },
    });
    expect(asked.map((a) => a.url)).toEqual([
      'https://api.crossref.org/works/10.6084%2Fm9.figshare.c.6858564',
      'https://api.datacite.org/dois/10.6084%2Fm9.figshare.c.6858564',
    ]);
    expect(asked[1]?.init?.headers).toEqual({ Accept: 'application/json' });
    expect(dataciteUrl('10.1/a b')).toBe('https://api.datacite.org/dois/10.1%2Fa%20b');
  });

  it('says when neither Crossref nor DataCite has a record', async () => {
    const result = await lookupDoi('10.9999/not.registered.anywhere', recordedFetch());
    expect(result).toEqual({
      ok: false,
      doi: '10.9999/not.registered.anywhere',
      failure: {
        kind: 'notFound',
        status: 404,
        message:
          'Neither Crossref nor DataCite has a record of 10.9999/not.registered.anywhere. Check the DOI; if it is right, it may be registered with another agency (such as mEDRA or JaLC), so enter the reference by hand.',
      },
    });
  });

  it('asks DataCite only when Crossref says it has no record', async () => {
    const asked: string[] = [];
    const answers = (crossref: () => Response, datacite: () => Response) =>
      (async (url: string | URL | Request) => {
        asked.push(String(url));
        return String(url).startsWith(DATACITE_DOIS) ? datacite() : crossref();
      }) as typeof fetch;
    const busy = await lookupDoi('10.1234/x', {
      fetch: answers(
        () => new Response('', { status: 503 }),
        () => new Response('', { status: 404 }),
      ),
    });
    expect(busy).toMatchObject({ ok: false, failure: { kind: 'busy' } });
    expect(asked).toHaveLength(1);
    asked.length = 0;
    const dataciteBusy = await lookupDoi('10.1234/x', {
      fetch: answers(
        () => new Response('', { status: 404 }),
        () => new Response('', { status: 503 }),
      ),
    });
    expect(dataciteBusy).toMatchObject({
      ok: false,
      failure: {
        kind: 'busy',
        status: 503,
        message:
          'Crossref has no record of 10.1234/x, and DataCite could not be asked: DataCite is busy or unavailable (HTTP 503): try again in a minute, or enter the reference by hand.',
      },
    });
    expect(asked).toHaveLength(2);
    const odd = await lookupDoi('10.1234/x', {
      fetch: answers(
        () => new Response('', { status: 404 }),
        () => new Response(JSON.stringify({ data: { type: 'clients' } })),
      ),
    });
    expect(odd).toMatchObject({
      failure: {
        kind: 'badReply',
        message: 'DataCite’s answer was not a DOI record: enter the reference by hand.',
      },
    });
  });

  it('says when it cannot reach Crossref, when Crossref is busy, and when the answer is not a work', async () => {
    const answer = (response: () => Response) => (async () => response()) as typeof fetch;
    const offline = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    const failure = async (run: typeof fetch) => {
      const result = await lookupDoi('10.1017/sus.2024.1', { fetch: run });
      return result.ok ? null : result.failure;
    };
    expect(await failure(offline)).toEqual({
      kind: 'offline',
      message:
        'Could not reach Crossref (api.crossref.org): check the internet connection, or enter the reference by hand.',
    });
    expect(await failure(answer(() => new Response('', { status: 503 })))).toMatchObject({
      kind: 'busy',
      status: 503,
      message:
        'Crossref is busy or unavailable (HTTP 503): try again in a minute, or enter the reference by hand.',
    });
    expect(await failure(answer(() => new Response('', { status: 429 })))).toMatchObject({ kind: 'busy' });
    expect(await failure(answer(() => new Response('', { status: 400 })))).toMatchObject({
      kind: 'badReply',
    });
    expect(await failure(answer(() => new Response('<html>', { status: 200 })))).toMatchObject({
      kind: 'badReply',
      message: 'Crossref’s answer could not be read: try again, or enter the reference by hand.',
    });
    expect(
      await failure(answer(() => new Response(JSON.stringify({ 'message-type': 'work-list', message: {} })))),
    ).toMatchObject({
      kind: 'badReply',
      message: 'Crossref’s answer was not a work record: enter the reference by hand.',
    });
  });

  it('stops when asked, and gives up when Crossref does not answer in time', async () => {
    const hang = ((_url: string, init?: RequestInit) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })) as typeof fetch;
    const stop = new AbortController();
    const stopped = lookupDoi('10.1017/sus.2024.1', { fetch: hang, signal: stop.signal });
    stop.abort();
    expect(await stopped).toMatchObject({ ok: false, failure: { kind: 'cancelled' } });
    const slow = await lookupDoi('10.1017/sus.2024.1', { fetch: hang, timeoutMs: 20 });
    expect(slow).toMatchObject({
      ok: false,
      failure: {
        kind: 'timeout',
        message: 'Crossref did not answer within 0.02 seconds: try again, or enter the reference by hand.',
      },
    });
  });
});
