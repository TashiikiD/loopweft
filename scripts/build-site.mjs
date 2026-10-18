#!/usr/bin/env node
// Builds the GitHub Pages site: the landing page in site/, files published from the repository, the viewer
// (apps/viewer) playing the example story at demo/, and the Studio (apps/studio) at studio/.
//
//   node scripts/build-site.mjs [out-dir]     (default: _site)

import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

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

for (const [app, path] of [
  ['apps/viewer', 'demo'],
  ['apps/studio', 'studio'],
]) {
  await build({
    root: resolve(root, app),
    configFile: resolve(root, app, 'vite.config.ts'),
    logLevel: 'warn',
    build: { outDir: resolve(out, path), emptyOutDir: true },
  });
}
process.stdout.write(`site built in ${out}\n`);
