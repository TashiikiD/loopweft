// The DOI lookup: Loopweft's only network call. It asks Crossref's public REST API for one work and sends
// nothing but the DOI (no account, no email, no custom headers). Every way it can fail has a plain message
// that says what to do instead, and entering the reference by hand always works offline.
import { type ReferenceDraft, referenceFromCrossref } from './crossref.ts';
import { readDoi } from './read.ts';

/** Where works are looked up: https://api.crossref.org/works/<DOI>. */
export const CROSSREF_WORKS = 'https://api.crossref.org/works/';

/** How long to wait for Crossref before giving up. */
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
  /** The HTTP status of Crossref's reply, when there was one. */
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

/** The address a DOI is looked up at. */
export const crossrefUrl = (doi: string): string => `${CROSSREF_WORKS}${encodeURIComponent(doi)}`;

const BY_HAND = 'enter the reference by hand';

/** Looks a DOI up at Crossref and drafts its APA reference. Never throws; a failure says why. */
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
  const fail = (kind: LookupFailureKind, message: string, status?: number): LookupResult => ({
    ok: false,
    doi,
    failure: { kind, message, ...(status !== undefined ? { status } : {}) },
  });
  const run = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? LOOKUP_TIMEOUT_MS;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await run(crossrefUrl(doi), { headers: { Accept: 'application/json' }, signal });
  } catch {
    if (options.signal?.aborted) return fail('cancelled', 'The lookup was stopped.');
    if (timeout.aborted) {
      return fail(
        'timeout',
        `Crossref did not answer within ${timeoutMs / 1000} seconds: try again, or ${BY_HAND}.`,
      );
    }
    return fail(
      'offline',
      `Could not reach Crossref (api.crossref.org): check the internet connection, or ${BY_HAND}.`,
    );
  }
  if (response.status === 404) {
    return fail(
      'notFound',
      `Crossref has no record of ${doi}. Check the DOI; if it is right, the DOI may be registered with another agency (DataCite registers many datasets and supplements), so ${BY_HAND}.`,
      404,
    );
  }
  if (response.status === 429 || response.status >= 500) {
    return fail(
      'busy',
      `Crossref is busy or unavailable (HTTP ${response.status}): try again in a minute, or ${BY_HAND}.`,
      response.status,
    );
  }
  if (!response.ok) {
    return fail(
      'badReply',
      `Crossref refused the lookup (HTTP ${response.status}): ${BY_HAND}.`,
      response.status,
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    if (options.signal?.aborted) return fail('cancelled', 'The lookup was stopped.');
    return fail(
      'badReply',
      `Crossref’s answer could not be read: try again, or ${BY_HAND}.`,
      response.status,
    );
  }
  const message = (body as { message?: unknown; 'message-type'?: unknown } | null)?.message;
  if (
    typeof body !== 'object' ||
    body === null ||
    (body as { 'message-type'?: unknown })['message-type'] !== 'work' ||
    typeof message !== 'object' ||
    message === null
  ) {
    return fail('badReply', `Crossref’s answer was not a work record: ${BY_HAND}.`, response.status);
  }
  return { ok: true, draft: referenceFromCrossref(message as Record<string, unknown>, doi) };
}
