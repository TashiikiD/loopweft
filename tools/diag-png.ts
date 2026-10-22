// TEMPORARY diagnostic (slice 7.5-png-determinism): draws a few steps several times, each in a fresh browser,
// and says where the pictures differ from the first. Removed before merging.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { exportInBrowser } from '@loopweft/export/node';
import { chromium } from '@playwright/test';
import { findBrowser } from './chrome.ts';

const out = resolve(process.argv[2] ?? 'diag');
const runs = Number(process.argv[3] ?? 6);
const steps = (process.argv[4] ?? 'S05.6b,S04.2a').split(',');
mkdirSync(out, { recursive: true });
const text = readFileSync('examples/polycrisis.loopweft', 'utf8');

const browser = await chromium.launch({ executablePath: findBrowser() ?? undefined });
const page = await browser.newPage();
const where = (a: Uint8Array, b: Uint8Array) =>
  page.evaluate(
    async ([x, y]) => {
      const pixels = async (base64: string) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
        context.drawImage(bitmap, 0, 0);
        return context.getImageData(0, 0, bitmap.width, bitmap.height);
      };
      const [p, q] = [await pixels(x), await pixels(y)];
      let n = 0;
      let max = 0;
      let [x0, y0, x1, y1] = [1e9, 1e9, -1, -1];
      for (let i = 0; i < p.data.length; i += 4) {
        let d = 0;
        for (let k = 0; k < 4; k++) d = Math.max(d, Math.abs((p.data[i + k] ?? 0) - (q.data[i + k] ?? 0)));
        if (!d) continue;
        n++;
        max = Math.max(max, d);
        const px = (i / 4) % p.width;
        const py = Math.floor(i / 4 / p.width);
        x0 = Math.min(x0, px);
        y0 = Math.min(y0, py);
        x1 = Math.max(x1, px);
        y1 = Math.max(y1, py);
      }
      return n ? `${n} pixels differ (up to ${max} levels) in x ${x0}-${x1}, y ${y0}-${y1}` : 'same pixels';
    },
    [Buffer.from(a).toString('base64'), Buffer.from(b).toString('base64')] as const,
  );

for (const step of steps) {
  let first: Uint8Array | null = null;
  for (let i = 0; i < runs; i++) {
    let bytes: Uint8Array = new Uint8Array();
    await exportInBrowser(
      text,
      { format: 'png', target: { kind: 'step', step }, scale: 1, categoryWords: false },
      (e) => {
        bytes = (e as { bytes: Uint8Array }).bytes;
      },
    );
    writeFileSync(join(out, `${step}-${i}.png`), bytes);
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
    const vs = first ? await where(first, bytes) : 'first';
    console.log(`${process.platform} ${step} run ${i}: ${hash} ${bytes.length} bytes; ${vs}`);
    first ??= bytes;
  }
}
await browser.close();
