// Lays out the stills from tools/capture.ts side by side, the deck on the left and Loopweft on the right:
// contact sheets as PNGs (one per run of scenes), and an index.html with every pair at full width for a closer
// look, with where they differ (from tools/diff.ts, when it has run). Follows the deck's tools/contact-sheet.ts.
//
//   node tools/contact-sheet.ts [--out review/phase1]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Pair } from './capture.ts';
import { still } from './chrome.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const at = args.indexOf('--out');
const out = resolve(root, at >= 0 ? (args[at + 1] ?? '') : 'review/phase1');
const { deck, pairs } = JSON.parse(readFileSync(join(out, 'pairs.json'), 'utf8')) as {
  deck: boolean;
  pairs: Pair[];
};
const differs = new Map(
  existsSync(join(out, 'diff.json'))
    ? (
        JSON.parse(readFileSync(join(out, 'diff.json'), 'utf8')) as { loopweft: string; differs: number }[]
      ).map((d) => [d.loopweft, d.differs])
    : [],
);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const image = (dir: string, key: string | null) =>
  key && existsSync(join(out, dir, `${key}.png`))
    ? `<img src="${dir}/${encodeURIComponent(key)}.png" alt="">`
    : `<div class="none">${key ? 'not captured' : dir === 'deck' ? 'not in the deck' : 'not in the example'}</div>`;
const caption = (p: Pair) => {
  const share = p.loopweft ? differs.get(p.loopweft) : undefined;
  return (
    `<figcaption><b>${esc(p.loopweft ?? p.deck ?? '')}</b>` +
    (p.deck && p.deck !== p.loopweft ? ` <span class="was">(deck ${esc(p.deck)})</span>` : '') +
    ` · ${esc(p.sceneTitle)}: ${esc(p.label)}` +
    (share !== undefined ? ` <span class="was">· differs: ${(share * 100).toFixed(1)}%</span>` : '') +
    p.notes.map((n) => `<span class="note">${esc(n)}</span>`).join('') +
    '</figcaption>'
  );
};
/** A pair: the deck, Loopweft and, on the index page, where they differ. */
const pairHtml = (p: Pair, withDifference: boolean) =>
  '<figure class="pair">' +
  (deck ? `<div class="shot">${image('deck', p.deck)}</div>` : '') +
  `<div class="shot">${image('loopweft', p.loopweft)}</div>` +
  (withDifference ? `<div class="shot">${image('diff', p.deck ? p.loopweft : null)}</div>` : '') +
  `${caption(p)}</figure>`;

const STYLE = `
  body{margin:0;background:#04110d;font:15px/1.35 'Segoe UI',system-ui,sans-serif;color:#a8bdb2}
  b{color:#70e2c5} .was{color:#6f8a7e} .note{display:block;color:#f2c46b}
  .none{display:grid;place-items:center;aspect-ratio:16/9;border:1px dashed #1a4236;color:#6f8a7e}
  img{display:block;width:100%;border:1px solid #1a4236}
  figure{margin:0} figcaption{grid-column:1/-1;padding-top:6px}
  .heads{display:grid;gap:8px;color:#f1f5ef;font-weight:600;letter-spacing:.08em;text-transform:uppercase}`;

// Sheets: whole scenes, up to 24 pairs each.
const sheets: Pair[][] = [];
for (const scene of [...new Set(pairs.map((p) => p.scene))]) {
  const rows = pairs.filter((p) => p.scene === scene);
  const last = sheets[sheets.length - 1];
  if (last && last.length + rows.length <= 24) last.push(...rows);
  else sheets.push([...rows]);
}

const THUMB_W = 464;
const columns = deck ? 2 : 4;
for (const [i, sheet] of sheets.entries()) {
  const scenes = [...new Set(sheet.map((p) => p.scene))];
  const pairWidth = (deck ? 2 : 1) * THUMB_W + (deck ? 8 : 0);
  const width = columns * pairWidth + (columns - 1) * 28 + 32;
  const rows = Math.ceil(sheet.length / columns);
  const height = rows * (Math.round((THUMB_W * 9) / 16) + 92) + 70;
  const html = `<!doctype html><meta charset="utf-8"><style>${STYLE}
    main{display:grid;grid-template-columns:repeat(${columns},${pairWidth}px);gap:20px 28px;padding:16px}
    .pair{display:grid;grid-template-columns:repeat(${deck ? 2 : 1},${THUMB_W}px);gap:8px;align-content:start}
    .heads{grid-template-columns:repeat(${columns},${pairWidth}px);padding:14px 16px 0;column-gap:28px}
    .heads div{display:grid;grid-template-columns:repeat(${deck ? 2 : 1},1fr);gap:8px}</style>
    <div class="heads">${Array.from({ length: columns }, () => `<div>${deck ? '<span>The deck</span><span>Loopweft</span>' : '<span>Loopweft</span>'}</div>`).join('')}</div>
    <main>${sheet.map((p) => pairHtml(p, false)).join('')}</main>`;
  const page = join(out, `_sheet-${i + 1}.html`);
  writeFileSync(page, html);
  const file = join(out, `sheet-${i + 1}-${scenes[0]}-${scenes[scenes.length - 1]}.png`);
  await still(pathToFileURL(page).href, file, { width, height, budgetMs: 3000 });
  process.stdout.write(`sheet ${file}\n`);
}

// Every pair at full width, by scene, for a closer look in a browser.
const withDifference = deck && differs.size > 0;
const heads = [
  ...(deck ? ['The deck'] : []),
  'Loopweft',
  ...(withDifference ? ['Where they differ (teal: only Loopweft · magenta: only the deck)'] : []),
];
const index = `<!doctype html><meta charset="utf-8"><title>Loopweft review</title><style>${STYLE}
  main{max-width:2600px;margin:0 auto;padding:16px 24px}
  h2{color:#f1f5ef;font-weight:600;margin:36px 0 12px}
  .pair{display:grid;grid-template-columns:repeat(${heads.length},1fr);gap:10px;margin-bottom:28px}
  .heads{grid-template-columns:repeat(${heads.length},1fr);position:sticky;top:0;background:#04110d;padding:10px 0}</style>
  <main><div class="heads">${heads.map((h) => `<span>${esc(h)}</span>`).join('')}</div>
  ${[...new Set(pairs.map((p) => p.scene))]
    .map((scene) => {
      const rows = pairs.filter((p) => p.scene === scene);
      return `<h2>${esc(scene)} · ${esc(rows[0]?.sceneTitle ?? '')}</h2>${rows.map((p) => pairHtml(p, withDifference)).join('')}`;
    })
    .join('')}</main>`;
writeFileSync(join(out, 'index.html'), index);
process.stdout.write(`index ${join(out, 'index.html')}\n`);
