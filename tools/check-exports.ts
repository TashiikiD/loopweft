// Checks every export in a folder, by script, for a review: that each file is what its name says and opens, and
// what is in it (pages, frames, size, length). The agent proofs run it on what an agent made; anyone can run it
// on a folder of exports.
//
//   node tools/check-exports.ts <folder> [--out <report.md>]
//
// - .loopweft: `loopweft validate` (errors and warnings);
// - .html: a one-file presentation that opens in headless Chrome or Edge, draws its stage, and logs no errors;
// - .png: the PNG signature and its size in pixels;
// - .svg: an SVG root with a viewBox, and how many texts and shapes it holds;
// - .pdf: the PDF signature and its page count (pdf-lib);
// - .mp4, .webm: the signature, and its size and length as Chrome plays it;
// - .gif: the GIF signature, its size and its frames.
// Prints a Markdown table (and writes it with --out); exits 1 if any file fails a check.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { main } from '../packages/cli/src/main.ts';
import { findBrowser } from './chrome.ts';

const args = process.argv.slice(2);
const folder = args[0] && !args[0].startsWith('--') ? resolve(args[0]) : null;
if (!folder) {
  process.stderr.write('Usage: node tools/check-exports.ts <folder> [--out <report.md>]\n');
  process.exit(2);
}
const outAt = args.indexOf('--out');
const out = outAt >= 0 ? args[outAt + 1] : undefined;

interface Row {
  file: string;
  ok: boolean;
  what: string;
}

const kb = (bytes: number) => `${Math.round(bytes / 1024).toLocaleString('en')} KB`;
const starts = (bytes: Buffer, magic: number[] | string, at = 0) =>
  (typeof magic === 'string' ? [...Buffer.from(magic, 'latin1')] : magic).every(
    (b, i) => bytes[at + i] === b,
  );

/** Every file under the folder, nested ones too, in name order. */
function filesIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .flatMap((d) => (d.isDirectory() ? filesIn(join(dir, d.name)) : [join(dir, d.name)]));
}

/** A GIF's size and frames, by walking its blocks. */
function gifInfo(b: Buffer): { width: number; height: number; frames: number } {
  const width = b.readUInt16LE(6);
  const height = b.readUInt16LE(8);
  let p = 13;
  const flags = b[10] as number;
  if (flags & 0x80) p += 3 * 2 ** ((flags & 7) + 1);
  let frames = 0;
  const skipBlocks = () => {
    while (p < b.length && b[p] !== 0) p += (b[p] as number) + 1;
    p += 1;
  };
  while (p < b.length) {
    const block = b[p];
    if (block === 0x3b) break;
    if (block === 0x21) {
      p += 2;
      skipBlocks();
    } else if (block === 0x2c) {
      frames++;
      const local = b[p + 9] as number;
      p += 10;
      if (local & 0x80) p += 3 * 2 ** ((local & 7) + 1);
      p += 1;
      skipBlocks();
    } else break;
  }
  return { width, height, frames };
}

const rows: Row[] = [];
const browser = await chromium.launch({ executablePath: findBrowser() });
try {
  for (const path of filesIn(folder)) {
    const file = path.slice(folder.length + 1).replace(/\\/g, '/');
    const ext = extname(path).toLowerCase();
    const bytes = readFileSync(path);
    const size = kb(statSync(path).size);
    const row = (ok: boolean, what: string) => rows.push({ file, ok, what: `${what} (${size})` });
    try {
      if (ext === '.loopweft') {
        let said = '';
        const code = await main(['validate', path, '--json'], {
          out: (t) => (said += t),
          err: (t) => (said += t),
        });
        const doc = JSON.parse(said) as { errors?: number; warnings?: number };
        const errors = doc.errors ?? 0;
        const warnings = doc.warnings ?? 0;
        row(code === 0 && errors === 0, `valid: ${errors} errors, ${warnings} warnings`);
      } else if (ext === '.html') {
        const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('console', (m) => {
          if (m.type() === 'error') errors.push(m.text());
        });
        const shows = (selector: string) =>
          page
            .locator(selector)
            .first()
            .waitFor({ timeout: 20_000 })
            .then(() => true)
            .catch(() => false);
        // Its start page, then the stage, as a rehearsal (one window, no console to wait for).
        await page.goto(pathToFileURL(path).href);
        const start = await shows('.lp-start');
        await page.goto(`${pathToFileURL(path).href}?view=audience&rehearse`);
        const stage = await shows('.lw-stage');
        const doctype = bytes.subarray(0, 15).toString('latin1').toLowerCase() === '<!doctype html>';
        await page.close();
        row(
          doctype && start && stage && errors.length === 0,
          [
            start ? 'opens on its start page' : 'no start page',
            stage ? 'draws its stage (rehearsal)' : 'no stage drawn',
            errors.length ? `errors: ${errors.slice(0, 2).join(' | ')}` : '',
          ]
            .filter(Boolean)
            .join('; '),
        );
      } else if (ext === '.png') {
        const ok = starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        row(ok, ok ? `PNG ${bytes.readUInt32BE(16)} × ${bytes.readUInt32BE(20)}` : 'not a PNG');
      } else if (ext === '.svg') {
        const text = bytes.toString('utf8');
        const view = /<svg[^>]*viewBox="([^"]+)"/.exec(text)?.[1];
        const count = (re: RegExp) => (text.match(re) ?? []).length;
        row(
          Boolean(view),
          view
            ? `SVG, viewBox ${view}: ${count(/<text\b/g)} texts, ${count(/<(path|circle|ellipse|rect|polygon|line)\b/g)} shapes`
            : 'no SVG root with a viewBox',
        );
      } else if (ext === '.pdf') {
        const ok = starts(bytes, '%PDF-');
        const pages = ok ? (await PDFDocument.load(bytes, { updateMetadata: false })).getPageCount() : 0;
        row(ok && pages > 0, ok ? `PDF, ${pages} page${pages === 1 ? '' : 's'}` : 'not a PDF');
      } else if (ext === '.mp4' || ext === '.webm') {
        const ok = ext === '.mp4' ? starts(bytes, 'ftyp', 4) : starts(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
        if (!ok) {
          row(false, `not ${ext === '.mp4' ? 'an MP4' : 'a WebM'}`);
          continue;
        }
        const page = await browser.newPage();
        await page.goto(pathToFileURL(join(folder, '.')).href);
        const played = await page.evaluate(async (src) => {
          const v = document.createElement('video');
          v.muted = true;
          v.preload = 'auto';
          v.src = src;
          document.body.append(v);
          await new Promise<void>((done, fail) => {
            v.onloadedmetadata = () => done();
            v.onerror = () => fail(new Error(v.error?.message ?? 'cannot play'));
          });
          // A WebM written as it is made may give no length until its end is read.
          if (!Number.isFinite(v.duration)) {
            v.currentTime = 1e9;
            await new Promise((r) => {
              v.ontimeupdate = r;
            });
          }
          return { width: v.videoWidth, height: v.videoHeight, seconds: v.duration };
        }, pathToFileURL(path).href);
        await page.close();
        row(
          played.width > 0 && played.seconds > 0,
          `${ext.slice(1).toUpperCase()} ${played.width} × ${played.height}, ${played.seconds.toFixed(1)} s, plays in Chrome`,
        );
      } else if (ext === '.gif') {
        const ok = starts(bytes, 'GIF89a') || starts(bytes, 'GIF87a');
        if (!ok) {
          row(false, 'not a GIF');
          continue;
        }
        const g = gifInfo(bytes);
        row(g.frames > 0, `GIF ${g.width} × ${g.height}, ${g.frames} frames`);
      } else {
        rows.push({ file, ok: true, what: `not an export (${size})` });
      }
    } catch (error) {
      row(false, `could not be read: ${(error as Error).message.split('\n')[0]}`);
    }
  }
} finally {
  await browser.close();
}

const report = [
  `| File | Check | What it holds |`,
  `|---|---|---|`,
  ...rows.map((r) => `| ${r.file} | ${r.ok ? 'ok' : '**FAILED**'} | ${r.what.replace(/\|/g, '\\|')} |`),
  '',
].join('\n');
process.stdout.write(report);
if (out) writeFileSync(resolve(out), report);
process.exit(rows.every((r) => r.ok) ? 0 : 1);
