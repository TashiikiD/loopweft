// The DOI lookup answered from the Crossref and DataCite replies recorded for the model's tests, so the
// command line's tests and its reference never touch the network.
import { existsSync, readFileSync } from 'node:fs';

const FIXTURES = new URL('../../model/test/fixtures/', import.meta.url);

export const recordedFetch = (async (url: string | URL | Request) => {
  const [, host, encoded] =
    /^https:\/\/api\.(crossref|datacite)\.org\/(?:works|dois)\/(.*)$/.exec(String(url)) ?? [];
  const doi = decodeURIComponent(encoded ?? '');
  const folder = new URL(`${host}/`, FIXTURES);
  const file = new URL(`${doi.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.json`, folder);
  if (!existsSync(file)) return new Response('Resource not found.', { status: 404 });
  const body = JSON.parse(readFileSync(file, 'utf8')) as { status: unknown; text?: string };
  if (typeof body.status === 'number') return new Response(body.text ?? '', { status: body.status });
  return new Response(JSON.stringify(body), { status: 200 });
}) as typeof fetch;
