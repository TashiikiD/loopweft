// The export page (page/) as one HTML file, built in memory as the player's page is: its script, styles and
// fonts inside it. Node only: the command line, the site build and the Studio's build call it.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOneFile } from '@loopweft/player/build';

const PAGE = join(dirname(fileURLToPath(import.meta.url)), '..', 'page');

let cached: Promise<string> | null = null;

/** The export page, built once per process; the same sources give the same bytes. */
export function exportPage(): Promise<string> {
  cached ??= buildOneFile(PAGE);
  return cached;
}
