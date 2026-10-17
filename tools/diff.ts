// Where the stills from tools/capture.ts differ: for each pair (the deck's build and the Loopweft step made from
// it), the share of the picture that differs, and an image of where. Run after the capture, before the sheets.
//
//   node tools/diff.ts [--out review/phase1]
//
// The comparison runs in headless Chrome (a canvas each), on a half-size copy, so text antialiasing counts
// for little. The deck's progress bar along the bottom edge is left out. Writes <out>/diff/<step>.png
// (the deck's picture dimmed, with what only Loopweft draws in teal and what only the deck draws in magenta)
// and <out>/diff.json, most different first.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pair } from './capture.ts';
import { headless } from './chrome.ts';
import { serve } from './serve.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const at = args.indexOf('--out');
const out = resolve(root, at >= 0 ? (args[at + 1] ?? '') : 'review/phase1');
const { pairs } = JSON.parse(readFileSync(join(out, 'pairs.json'), 'utf8')) as { pairs: Pair[] };
const both = pairs.filter((p) => p.deck && p.loopweft);
mkdirSync(join(out, 'diff'), { recursive: true });

// The page compares each pair, posts the picture of the difference, and finally posts the scores.
const page = `<!doctype html><meta charset="utf-8"><script type="module">
const pairs = ${JSON.stringify(both.map((p) => ({ deck: p.deck, loopweft: p.loopweft })))};
const W = 960, H = 540, THRESHOLD = 40;
// The deck's progress bar: a thin line 26 px above the bottom edge of the 1080 px stage.
const ignored = (y) => y >= 520 && y <= 531;
const load = (src) => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src; });
const pixels = (img) => { const c = new OffscreenCanvas(W, H); const g = c.getContext('2d'); g.drawImage(img, 0, 0, W, H); return g.getImageData(0, 0, W, H).data; };
const scores = [];
for (const p of pairs) {
  const [a, b] = await Promise.all([load('deck/' + p.deck + '.png'), load('loopweft/' + p.loopweft + '.png')]);
  const da = pixels(a), db = pixels(b);
  const canvas = new OffscreenCanvas(W, H); const g = canvas.getContext('2d');
  const img = g.createImageData(W, H); const o = img.data;
  let differing = 0, extra = 0, missing = 0, counted = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const delta = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
    const la = da[i] * 0.3 + da[i + 1] * 0.59 + da[i + 2] * 0.11, lb = db[i] * 0.3 + db[i + 1] * 0.59 + db[i + 2] * 0.11;
    o[i + 3] = 255;
    if (!ignored(y)) counted++;
    if (!ignored(y) && delta > THRESHOLD) {
      differing++;
      if (lb >= la) { extra++; o[i] = 60; o[i + 1] = 240; o[i + 2] = 200; } else { missing++; o[i] = 255; o[i + 1] = 79; o[i + 2] = 216; }
    } else { o[i] = da[i] * 0.3; o[i + 1] = da[i + 1] * 0.3; o[i + 2] = da[i + 2] * 0.3; }
  }
  g.putImageData(img, 0, 0);
  const png = await canvas.convertToBlob({ type: 'image/png' });
  await fetch('/receive/' + p.loopweft + '.png', { method: 'POST', body: png });
  scores.push({ loopweft: p.loopweft, deck: p.deck, differs: differing / counted, onlyLoopweft: extra / counted, onlyDeck: missing / counted });
}
scores.sort((x, y) => y.differs - x.differs);
await fetch('/receive/diff.json', { method: 'POST', body: JSON.stringify(scores, null, 2) + '\\n' });
document.title = 'done';
</script>`;
writeFileSync(join(out, '_diff.html'), page);

let received = 0;
const served = await serve(out, {
  receive: (name, data) => {
    writeFileSync(name === 'diff.json' ? join(out, name) : join(out, 'diff', name), data);
    received++;
  },
});
try {
  // A generous budget: the page loads and compares every pair before the browser closes.
  await headless(['--virtual-time-budget=600000', '--dump-dom', `${served.url}/_diff.html`], 600_000);
} finally {
  await served.close();
}
const scores = JSON.parse(readFileSync(join(out, 'diff.json'), 'utf8')) as {
  loopweft: string;
  deck: string;
  differs: number;
}[];
process.stdout.write(`${received - 1} pairs compared; most different:\n`);
for (const s of scores.slice(0, 15)) {
  process.stdout.write(
    `  ${s.loopweft.padEnd(8)} (deck ${s.deck.padEnd(7)}) ${(s.differs * 100).toFixed(2)}%\n`,
  );
}
