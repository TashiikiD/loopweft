// The DOI lookup: Loopweft's only network call. It asks Crossref's public REST API for the work, and, when
// Crossref has no record of the DOI, DataCite's (which registers data sets, software, collections and
// supplements). It sends nothing but the DOI (no account, no email, no custom headers). Every way it can
// fail has a plain message that says what to do instead, and entering the reference by hand always works
// offline.
import type { ReferenceDraft } from './apa.ts';
import { referenceFromCrossref } from './crossref.ts';
import { referenceFromDataCite } from './datacite.ts';
import { readDoi } from './read.ts';

/** Where works are looked up first: https://api.crossref.org/works/<DOI>. */
export const CROSSREF_WORKS = 'https://api.crossref.org/works/';

/** Where a DOI Crossref does not hold is looked up next: https://api.datacite.org/dois/<DOI>. */
export const DATACITE_DOIS = 'https://api.datacite.org/dois/';

/** How long to wait for each agency before giving up. */
export const LOOKUP_TIMEOUT_MS = 20_000;

export type LookupFailureKind =
  | 'invalidDoi'
  | 'offline'
  | 'timeout'
  | 'notFound'
  | 'busy'
  | 'badReply'
  | 'cancelled';

export interface LookupFailure {
  kind: LookupFailureKind;
  message: string;
  /** The HTTP status of the reply that failed, when there was one. */
  status?: number;
}

export type LookupResult =
  | { ok: true; draft: ReferenceDraft }
  | { ok: false; doi?: string; failure: LookupFailure };

export interface LookupOptions {
  /** The fetch to use (tests pass one that answers from recorded replies). Default: the global fetch. */
  fetch?: typeof fetch;
  /** Stops the lookup, e.g. when the person closes the dialog. */
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** The addresses a DOI is looked up at. */
export const crossrefUrl = (doi: string): string => `${CROSSREF_WORKS}${encodeURIComponent(doi)}`;
export const dataciteUrl = (doi: string): string => `${DATACITE_DOIS}${encodeURIComponent(doi)}`;

const BY_HAND = 'enter the reference by hand';

type Asked =
  | { ok: true; body: unknown; status: number }
  | { ok: false; failure: LookupFailure; notFound?: true };

/** Asks one agency for the record of a DOI. */
async function ask(agency: string, host: string, url: string, options: LookupOptions): Promise<Asked> {
  const fail = (kind: LookupFailureKind, message: string, status?: number): Asked => ({
    ok: false,
    failure: { kind, message, ...(status !== undefined ? { status } : {}) },
  });
  const run = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? LOOKUP_TIMEOUT_MS;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await run(url, { headers: { Accept: 'application/json' }, signal });
  } catch {
    if (options.signal?.aborted) return fail('cancelled', 'The lookup was stopped.');
    if (timeout.aborted) {
      return fail(
        'timeout',
        `${agency} did not answer within ${timeoutMs / 1000} seconds: try again, or ${BY_HAND}.`,
      );
    }
    return fail(
      'offline',
      `Could not reach ${agency} (${host}): check the internet connection, or ${BY_HAND}.`,
    );
  }
  if (response.status === 404) {
    return {
      ok: false,
      failure: { kind: 'notFound', message: `${agency} has no record of it.`, status: 404 },
      notFound: true,
    };
  }
  if (response.status === 429 || response.status >= 500) {
    return fail(
      'busy',
      `${agency} is busy or unavailable (HTTP ${response.status}): try again in a minute, or ${BY_HAND}.`,
      response.status,
    );
  }
  if (!response.ok) {
    return fail(
      'badReply',
      `${agency} refused the lookup (HTTP ${response.status}): ${BY_HAND}.`,
      response.status,
    );
  }
  try {
    return { ok: true, body: await response.json(), status: response.status };
  } catch {
    if (options.signal?.aborted) return fail('cancelled', 'The lookup was stopped.');
    return fail(
      'badReply',
      `${agency}’s answer could not be read: try again, or ${BY_HAND}.`,
      response.status,
    );
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Looks a DOI up, at Crossref and then, if Crossref has no record of it, at DataCite, and drafts its APA
 * reference. Never throws; a failure says why.
 */
export async function lookupDoi(input: string, options: LookupOptions = {}): Promise<LookupResult> {
  const doi = readDoi(input);
  if (!doi) {
    return {
      ok: false,
      failure: {
        kind: 'invalidDoi',
        message: `“${input.trim()}” is not a DOI. A DOI starts with 10., a number and a slash, e.g. 10.1017/sus.2024.1.`,
      },
    };
  }
  const failed = (failure: LookupFailure): LookupResult => ({ ok: false, doi, failure });

  const crossref = await ask('Crossref', 'api.crossref.org', crossrefUrl(doi), options);
  if (crossref.ok) {
    const body = crossref.body;
    if (!isObject(body) || body['message-type'] !== 'work' || !isObject(body.message)) {
      return failed({
        kind: 'badReply',
        message: `Crossref’s answer was not a work record: ${BY_HAND}.`,
        status: crossref.status,
      });
    }
    return { ok: true, draft: referenceFromCrossref(body.message, doi) };
  }
  if (!crossref.notFound) return failed(crossref.failure);

  // Crossref has no record of it: DataCite may.
  const datacite = await ask('DataCite', 'api.datacite.org', dataciteUrl(doi), options);
  if (datacite.ok) {
    const data = isObject(datacite.body) ? datacite.body.data : undefined;
    if (!isObject(data) || data.type !== 'dois' || !isObject(data.attributes)) {
      return failed({
        kind: 'badReply',
        message: `DataCite’s answer was not a DOI record: ${BY_HAND}.`,
        status: datacite.status,
      });
    }
    return { ok: true, draft: referenceFromDataCite(data.attributes, doi) };
  }
  if (datacite.notFound) {
    return failed({
      kind: 'notFound',
      status: 404,
      message: `Neither Crossref nor DataCite has a record of ${doi}. Check the DOI; if it is right, it may be registered with another agency (such as mEDRA or JaLC), so ${BY_HAND}.`,
    });
  }
  if (datacite.failure.kind === 'cancelled') return failed(datacite.failure);
  return failed({
    ...datacite.failure,
    message: `Crossref has no record of ${doi}, and DataCite could not be asked: ${datacite.failure.message}`,
  });
}
