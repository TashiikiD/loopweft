// Rebuilds examples/polycrisis.loopweft from the private polycrisis deck. Run with
//
//   npm run convert:polycrisis -- --deck <folder of PolycrisisPresentation> [--out <file>]
//
// The deck folder can also come from LOOPWEFT_POLYCRISIS_DECK or `.local.json` (see polycrisis-deck.ts).
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertPolycrisis } from '../src/importers/polycrisis.ts';
import { serializeProject } from '../src/serialize.ts';
import { validateProject } from '../src/validate.ts';
import { deckFolder, readDeck } from './polycrisis-deck.ts';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const args = process.argv;
const folder = deckFolder(args);
if (!folder) {
  process.stderr.write(
    'Where is the polycrisis deck? Pass --deck <folder>, or set LOOPWEFT_POLYCRISIS_DECK, or put\n' +
      '{ "polycrisisDeck": "<folder>" } in .local.json at the repository root.\n',
  );
  process.exit(2);
}
const at = args.indexOf('--out');
const out = resolve(repoRoot, at >= 0 ? (args[at + 1] ?? '') : 'examples/polycrisis.loopweft');

const { project, notes } = convertPolycrisis(await readDeck(folder));
writeFileSync(out, serializeProject(project));
const warnings = validateProject(project).filter((i) => i.severity === 'warning');
const steps = project.story.scenes.reduce((n, s) => n + s.steps.length, 0);
process.stdout.write(
  [
    `wrote ${out}`,
    `${project.variables.length} variables, ${project.links.length} links, ${project.loops.length} named loops, ` +
      `${project.sources.length} sources, ${project.story.scenes.length} scenes, ${steps} steps; ` +
      `${warnings.length} warnings`,
    ...notes.map((n) => `- ${n}`),
    '',
  ].join('\n'),
);
