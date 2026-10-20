#!/usr/bin/env node
// Builds the GitHub Pages site: the landing page in site/, files published from the repository, the Studio
// (apps/studio) at studio/, and the polycrisis example exported as one HTML file at demo/ (the same file the
// Studio's Export and `loopweft export --html` make, which the landing page also offers as a download).
//
//   node scripts/build-site.mjs [out-dir]     (default: _site)

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { readProject } from '../packages/model/src/index.ts';
import { playerTemplate } from '../packages/player/build/template.ts';
import { exportHtml } from '../packages/player/src/export.ts';

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

await build({
  root: resolve(root, 'apps/studio'),
  configFile: resolve(root, 'apps/studio/vite.config.ts'),
  logLevel: 'warn',
  build: { outDir: resolve(out, 'studio'), emptyOutDir: true },
});

const read = readProject(readFileSync(resolve(root, 'examples/polycrisis.loopweft'), 'utf8'));
if (!read.ok) throw new Error('The example does not open.');
const example = exportHtml(read.project, await playerTemplate(), { notes: true });
mkdirSync(resolve(out, 'demo'), { recursive: true });
writeFileSync(resolve(out, 'demo/index.html'), example.html);

process.stdout.write(`site built in ${out}\n`);
