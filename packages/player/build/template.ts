// Source: PolycrisisPresentation tools/package.ts (singleFile) @ 3e5da10 (private), adapted for Loopweft: the
// player's page is built in memory, with its script, styles and fonts inlined, into a template that any
// project can be put into (src/export.ts). Node only: the command line, the site build and the Studio's
// build call it.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type Rollup } from 'vite';
import { SLOT } from '../src/export.ts';

const PAGE = join(dirname(fileURLToPath(import.meta.url)), '..', 'page');

let cached: Promise<string> | null = null;

/**
 * The player's page as one HTML file: the script, the styles and the fonts inside it, nothing loaded from
 * anywhere else. Its project slot is empty. Built once per process; the same sources give the same bytes.
 */
export function playerTemplate(): Promise<string> {
  cached ??= buildPlayerTemplate();
  return cached;
}

/** Builds the template afresh (playerTemplate keeps the first build). */
export async function buildPlayerTemplate(): Promise<string> {
  const html = await buildOneFile(PAGE);
  if (!html.includes(SLOT)) throw new Error('The player page has no project slot.');
  return html;
}

/**
 * A Vite page (its folder holds index.html and vite.config.ts) built in memory into one HTML file: its one
 * script, its styles and every font and image inside it, nothing loaded from anywhere else. The same sources
 * give the same bytes. The player's page and the export page (@loopweft/export) are built this way.
 */
export async function buildOneFile(root: string): Promise<string> {
  const result = await build({
    root,
    configFile: join(root, 'vite.config.ts'),
    mode: 'production',
    // Silent: the command line's --json output must be one JSON document. A failed build still throws.
    logLevel: 'silent',
    build: {
      write: false,
      // Every font and image goes into the page as a data address.
      assetsInlineLimit: () => true,
      cssCodeSplit: false,
      modulePreload: false,
      sourcemap: false,
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]) as Rollup.RollupOutput[];
  const files = outputs.flatMap((o) => o.output);
  const page = files.find((f) => f.fileName === 'index.html');
  if (page?.type !== 'asset') throw new Error(`The page in ${root} was not built.`);
  let html = String(page.source);

  const scripts = files.filter((f): f is Rollup.OutputChunk => f.type === 'chunk');
  if (scripts.length !== 1) throw new Error(`The page built ${scripts.length} scripts; it must build one.`);
  let js = (scripts[0] as Rollup.OutputChunk).code;
  // Script text inside the page must not close its own element early, nor open an HTML comment or another
  // script element (which would hide the real end of this one). They only occur inside strings and patterns
  // (the model's SVG check names "<!--"), where an escaped "<" (backslash, x3C) reads the same.
  const escapedLessThan = `${String.fromCharCode(92)}x3C`;
  js = js
    .replace(/<\/script/gi, '<\\/script')
    .replace(/<(!--|script)/gi, (_, rest: string) => `${escapedLessThan}${rest}`);
  if (/<!--|<script/i.test(js)) throw new Error('The page script still holds "<!--" or "<script".');
  const styles = files
    .filter((f): f is Rollup.OutputAsset => f.type === 'asset' && f.fileName.endsWith('.css'))
    .map((f) => String(f.source))
    .join('\n');
  if (/<\/style/i.test(styles))
    throw new Error('The page styles hold "</style", which cannot sit inside a page.');

  html = html.replace(
    /<script type="module" crossorigin src="[^"]+"><\/script>/,
    () => `<script type="module">${js}</script>`,
  );
  html = html.replace(/<link rel="stylesheet" crossorigin href="[^"]+">/, () => `<style>${styles}</style>`);
  // Nothing may still point at a file beside the page.
  const leftover = /(?:src|href)=["']\.?\/?assets\/[^"']+["']|url\(\.?\/?assets\/[^)]+\)/.exec(html);
  if (leftover) throw new Error(`The one-file page still refers to ${leftover[0]}`);
  return html;
}
