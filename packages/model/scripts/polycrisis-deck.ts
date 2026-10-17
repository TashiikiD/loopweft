// Reads the private polycrisis deck (PolycrisisPresentation) into the shape the converter takes. Node only:
// it reads the deck's content files and imports its assembled scene specs, which are plain TypeScript data.
// The deck itself is never written to.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DeckScene, PolycrisisDeck } from '../src/importers/polycrisis.ts';

const repoRoot = new URL('../../../', import.meta.url);

/** This machine's settings, from the repository's git-ignored `.local.json` (empty when there is none). */
function localSettings(): { polycrisisDeck?: string; privateWords?: string[] } {
  const local = new URL('.local.json', repoRoot);
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
    (flag >= 0 ? argv[flag + 1] : process.env.LOOPWEFT_POLYCRISIS_DECK) || localSettings().polycrisisDeck;
  return folder && existsSync(join(folder, 'content', 'map.json')) ? folder : undefined;
}

/**
 * Words that must never appear in the example, such as the presenter's name, kept out of the repository:
 * LOOPWEFT_PRIVATE_WORDS (comma-separated), else "privateWords" in `.local.json`. Empty when neither is set.
 */
export function privateWords(): string[] {
  const env = process.env.LOOPWEFT_PRIVATE_WORDS;
  const words = env ? env.split(',') : (localSettings().privateWords ?? []);
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
  return structuredClone({
    map: json('content/map.json'),
    layout: json('content/layout.json'),
    narration: json('content/narration.json'),
    visuals: json('content/visuals.json'),
    hubNodes: [...HUB_NODES],
    bends: Object.fromEntries([...buildGraph().edges].map(([id, e]) => [id, e.bend])),
    scenes,
  });
}
