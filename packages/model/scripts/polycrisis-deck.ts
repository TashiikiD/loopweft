// Reads the private polycrisis deck (PolycrisisPresentation) into the shape the converter takes. Node only:
// it reads the deck's content files and imports its assembled scene specs, which are plain TypeScript data.
// The deck itself is never written to.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DeckScene, PolycrisisDeck } from '../src/importers/polycrisis.ts';

const repoRoot = new URL('../../../', import.meta.url);

/**
 * Where the deck lives on this machine: `--deck <folder>`, else the LOOPWEFT_POLYCRISIS_DECK environment
 * variable, else "polycrisisDeck" in the repository's git-ignored `.local.json`. Undefined when none is set
 * or the folder is missing (as on CI, where the deck is not available).
 */
export function deckFolder(argv: readonly string[] = process.argv): string | undefined {
  const flag = argv.indexOf('--deck');
  let folder = flag >= 0 ? argv[flag + 1] : process.env.LOOPWEFT_POLYCRISIS_DECK;
  const local = new URL('.local.json', repoRoot);
  if (!folder && existsSync(local)) {
    folder = (JSON.parse(readFileSync(local, 'utf8')) as { polycrisisDeck?: string }).polycrisisDeck;
  }
  return folder && existsSync(join(folder, 'content', 'map.json')) ? folder : undefined;
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
  const { HUB_NODES } = (await module('src/map/graph.ts')) as { HUB_NODES: Set<string> };
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
    scenes,
  });
}
