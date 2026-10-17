#!/usr/bin/env node
// Builds the GitHub Pages site: the landing page in site/, plus files published from the repository.
//
//   node scripts/build-site.mjs [out-dir]     (default: _site)

import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = resolve(process.argv[2] ?? resolve(root, '_site'));

/** [source in the repository, path on the site] */
const FILES = [
  ['site', '.'],
  // The JSON Schema that `.loopweft` files name in "$schema" (SCHEMA_URL in packages/model/src/schema.ts).
  ['packages/model/schema/loopweft.v1.schema.json', 'schema/v1.json'],
];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const [from, to] of FILES) cpSync(resolve(root, from), resolve(out, to), { recursive: true });
process.stdout.write(`site built in ${out}\n`);
