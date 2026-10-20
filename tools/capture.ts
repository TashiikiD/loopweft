// Stills of every step of the example story, played by the exported example (the site's demo/), and of the polycrisis deck's builds, for
// side-by-side review (tools/contact-sheet.ts). Follows the deck's tools/capture.ts.
//
//   node tools/capture.ts [--out review/phase1] [--only S04.2a,S05.2] [--budget 6000] [--site <built site>]
//                         [--deck <folder> | --no-deck]
//
// - Loopweft: the site (with the example exported as one HTML file at demo/) is built into a temporary folder,
//   unless --site names a built one, and served on this machine; each step is captured at
//   demo/?view=audience&capture=1#<step>.
// - The deck: its own built dist/ folder is served read-only and each build is captured at
//   ?view=audience&capture=1#<build>, as the deck's own capture tool did. Nothing is written into the deck.
//   The deck folder comes from --deck, LOOPWEFT_POLYCRISIS_DECK or .local.json; without one, only Loopweft is
//   captured.
//
// Writes <out>/loopweft/<step>.png, <out>/deck/<build>.png and <out>/pairs.json. The deck's stills show its
// private title page: keep the output out of the repository (review/ is git-ignored).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deckFolder, readDeck } from '../packages/model/scripts/polycrisis-deck.ts';
import { ONE_OFF_VISUALS, POLYCRISIS_CLEANUP, readProject } from '../packages/model/src/index.ts';
import { pool, still } from './chrome.ts';
import { serve } from './serve.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

/** One row of the review: a deck build and the Loopweft step made from it (either may be missing). */
export interface Pair {
  scene: string;
  sceneTitle: string;
  deck: string | null;
  loopweft: string | null;
  label: string;
  /** Differences to expect, e.g. a one-off visual that stays in the deck. */
  notes: string[];
}

const out = resolve(root, option('out') ?? 'review/phase1');
const only = option('only')?.split(',');
const budgetMs = Number(option('budget') ?? 6000);
const wanted = (key: string | null) => key !== null && (!only || only.includes(key));

const parsed = readProject(readFileSync(join(root, 'examples/polycrisis.loopweft'), 'utf8'));
if (!parsed.ok) throw new Error('The example does not open; run the tests.');
const project = parsed.project;
const deck = args.includes('--no-deck') ? undefined : deckFolder(args);

// Pairs: by step id, as the converter made them (a dropped build has no step; a renumbered one moved).
const pairs: Pair[] = [];
if (deck) {
  const { scenes } = await readDeck(deck);
  for (const scene of scenes) {
    const steps = new Set(project.story.scenes.find((s) => s.id === scene.id)?.steps.map((s) => s.id) ?? []);
    for (const build of scene.builds) {
      const dropped = POLYCRISIS_CLEANUP.dropBuilds[build.key];
      const id = POLYCRISIS_CLEANUP.renumber[build.key] ?? build.id;
      const oneOff = Object.keys(build.viz ?? {}).filter((kind) => ONE_OFF_VISUALS.has(kind));
      pairs.push({
        scene: scene.id,
        sceneTitle: scene.title,
        deck: build.key,
        loopweft: !dropped && steps.has(id) ? `${scene.id}.${id}` : null,
        label: build.label,
        notes: [
          ...(dropped ? [`Left out of the example: ${dropped}.`] : []),
          ...oneOff.map((kind) => `The deck's one-off visual "${kind}" stays in the deck.`),
        ],
      });
    }
  }
} else {
  for (const scene of project.story.scenes) {
    for (const step of scene.steps) {
      pairs.push({
        scene: scene.id,
        sceneTitle: scene.title,
        deck: null,
        loopweft: `${scene.id}.${step.id}`,
        label: step.label,
        notes: [],
      });
    }
  }
}

mkdirSync(join(out, 'loopweft'), { recursive: true });
writeFileSync(join(out, 'pairs.json'), `${JSON.stringify({ deck: !!deck, pairs }, null, 2)}\n`);

let site = option('site');
let temporary: string | null = null;
if (!site) {
  temporary = mkdtempSync(join(tmpdir(), 'loopweft-site-'));
  const build = spawnSync(process.execPath, ['scripts/build-site.mjs', temporary], {
    cwd: root,
    encoding: 'utf8',
  });
  if (build.status !== 0) throw new Error(`The site did not build:\n${build.stderr}`);
  site = temporary;
}

const shoot = async (base: string, jobs: { key: string; url: string; dir: string }[]) => {
  let done = 0;
  await pool(jobs, 3, async (job) => {
    await still(`${base}${job.url}`, join(out, job.dir, `${job.key}.png`), { budgetMs });
    done++;
    process.stdout.write(`${job.dir} ${job.key} (${done}/${jobs.length})\n`);
  });
};

try {
  const served = await serve(site);
  try {
    await shoot(
      served.url,
      pairs
        .filter((p) => wanted(p.loopweft))
        .map((p) => ({
          key: p.loopweft as string,
          url: `/demo/?view=audience&capture=1#${p.loopweft}`,
          dir: 'loopweft',
        })),
    );
  } finally {
    await served.close();
  }

  const dist = deck ? join(deck, 'dist') : undefined;
  if (dist && existsSync(join(dist, 'index.html'))) {
    mkdirSync(join(out, 'deck'), { recursive: true });
    const deckServed = await serve(dist);
    try {
      await shoot(
        deckServed.url,
        pairs
          .filter((p) => wanted(p.deck))
          .map((p) => ({ key: p.deck as string, url: `/?view=audience&capture=1#${p.deck}`, dir: 'deck' })),
      );
    } finally {
      await deckServed.close();
    }
  } else if (deck) {
    process.stdout.write(
      `The deck has no built dist/ folder, so it was not captured (it is never built from here).\n`,
    );
  }
} finally {
  if (temporary) rmSync(temporary, { recursive: true, force: true });
}
process.stdout.write(`stills in ${out}\n`);
