// Regenerates docs/cli.md, the command line's full reference. Run with `npm run cli-docs`.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildReference } from '../src/reference.ts';
import { recordedFetch } from './recorded-fetch.ts';

const FILE = new URL('../../../docs/cli.md', import.meta.url);

writeFileSync(FILE, await buildReference({ fetch: recordedFetch }));
process.stdout.write(`wrote ${fileURLToPath(FILE)}\n`);
