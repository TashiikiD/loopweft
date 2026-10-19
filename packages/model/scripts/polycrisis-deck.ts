// Reads the private polycrisis deck (PolycrisisPresentation) into the shape the converter takes. Node only:
// it reads the deck's content files and imports its assembled scene specs, which are plain TypeScript data.
// The deck itself is never written to.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { DeckScene, PolycrisisDeck } from '../src/importers/polycrisis.ts';

/** The checkout these scripts are in. */
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * The main checkout of the repository that the checkout at `root` is a linked worktree of
 * (`git worktree add`): the folder that holds the repository's `.git` folder, as `git worktree list` names
 * it. Undefined when `root` is not a linked worktree, or when the repository has no main checkout (a bare
 * repository, or a submodule's).
 */
function mainCheckout(root: string): string | undefined {
  // A linked worktree has a `.git` file, naming its own folder in the repository; a main checkout has the
  // `.git` folder itself.
  if (!statSync(join(root, '.git'), { throwIfNoEntry: false })?.isFile()) return undefined;
  let shared: string;
  try {
    shared = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: root,
      // Git finds the repository from `root` itself, not from the one a hook names (GIT_DIR), which may be
      // another repository's (Windows reads a variable's name in any letter case).
      env: Object.fromEntries(
        Object.entries(process.env).filter(
          ([name]) => !['GIT_DIR', 'GIT_COMMON_DIR'].includes(name.toUpperCase()),
        ),
      ),
      encoding: 'utf8',
      stdio: 'pipe',
    }).trim();
  } catch {
    return undefined;
  }
  return basename(shared) === '.git' ? dirname(shared) : undefined;
}

/**
 * This machine's settings, from the git-ignored `.local.json` at the root of the checkout at `root`. A linked
 * worktree shares the repository but not its ignored files, so one that has none reads the main checkout's.
 * Empty when there is none.
 */
function localSettings(root: string): { polycrisisDeck?: string; privateWords?: string[] } {
  const own = join(root, '.local.json');
  const main = existsSync(own) ? undefined : mainCheckout(root);
  const local = main === undefined ? own : join(main, '.local.json');
  return existsSync(local) ? JSON.parse(readFileSync(local, 'utf8')) : {};
}

/**
 * Where the deck lives on this machine: `--deck <folder>`, else the LOOPWEFT_POLYCRISIS_DECK environment
 * variable, else "polycrisisDeck" in `.local.json`. Undefined when none is set or the folder is missing (as
 * on CI, where the deck is not available).
 */
export function deckFolder(argv: readonly string[] = process.argv): string | undefined {
  const flag = argv.indexOf('--deck');
  const folder =
    (flag >= 0 ? argv[flag + 1] : process.env.LOOPWEFT_POLYCRISIS_DECK) ||
    localSettings(repoRoot).polycrisisDeck;
  return folder && existsSync(join(folder, 'content', 'map.json')) ? folder : undefined;
}

/**
 * Words that must never appear in the example, such as the presenter's name, kept out of the repository:
 * LOOPWEFT_PRIVATE_WORDS (comma-separated), else "privateWords" in `.local.json` (of the checkout at `root`,
 * or of the main checkout from a linked worktree that has none). Empty when neither is set.
 */
export function privateWords(root: string = repoRoot): string[] {
  const env = process.env.LOOPWEFT_PRIVATE_WORDS;
  const words = env ? env.split(',') : (localSettings(root).privateWords ?? []);
  return words.map((w) => w.trim().toLowerCase()).filter(Boolean);
}

/** The deck's content files and its assembled builds. */
export async function readDeck(folder: string): Promise<PolycrisisDeck> {
  const json = (path: string) => JSON.parse(readFileSync(join(folder, path), 'utf8'));
  const module = (path: string) => import(pathToFileURL(join(folder, path)).href);
  const { DECK } = (await module('src/scenes/index.ts')) as {
    DECK: {
      scenes: (Omit<DeckScene, 'builds'> & {
        builds: (Omit<DeckScene['builds'][number], 'caption' | 'map' | 'viz'> & {
          spec: Pick<DeckScene['builds'][number], 'caption' | 'map' | 'viz'>;
        })[];
      })[];
    };
  };
  const { HUB_NODES, buildGraph } = (await module('src/map/graph.ts')) as {
    HUB_NODES: Set<string>;
    // Pure: the deck's map geometry from its own content files.
    buildGraph: () => { edges: Map<string, { bend: number }> };
  };
  const { FULL_CAMERA } = (await module('src/map/camera.ts')) as {
    // The deck's whole-map view, set by hand.
    FULL_CAMERA: { cx: number; cy: number; zoom: number };
  };
  // Only the parts the converter reads, as plain data.
  const scenes: DeckScene[] = DECK.scenes.map((s) => ({
    id: s.id,
    number: s.number,
    title: s.title,
    headline: s.headline,
    overlay: s.overlay,
    builds: s.builds.map((b) => ({
      key: b.key,
      id: b.id,
      label: b.label,
      cue: b.cue,
      extraCues: b.extraCues,
      ...(b.spec.caption ? { caption: b.spec.caption } : {}),
      ...(b.spec.map ? { map: b.spec.map } : {}),
      ...(b.spec.viz ? { viz: b.spec.viz } : {}),
    })),
  }));
  // The cameo's figure, from the deck's public folder, and the alt text the deck's code gives it.
  const visuals = json('content/visuals.json');
  const alt = readFileSync(join(folder, 'src/viz/cameo.ts'), 'utf8').match(/\balt: '([^']+)'/)?.[1];
  if (!alt) throw new Error("The deck's cameo has no alt text in src/viz/cameo.ts.");
  const figure: string = visuals.cameo.image;
  return structuredClone({
    map: json('content/map.json'),
    layout: json('content/layout.json'),
    narration: json('content/narration.json'),
    visuals: { ...visuals, cameo: { ...visuals.cameo, alt } },
    media: { [figure]: new Uint8Array(readFileSync(join(folder, 'public', figure))) },
    hubNodes: [...HUB_NODES],
    bends: Object.fromEntries([...buildGraph().edges].map(([id, e]) => [id, e.bend])),
    camera: { cx: FULL_CAMERA.cx, cy: FULL_CAMERA.cy, zoom: FULL_CAMERA.zoom },
    scenes,
  });
}
