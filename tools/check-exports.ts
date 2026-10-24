// Checks every export in a folder, by script, for a review: that each file is what its name says and opens, and
// what is in it (pages, frames, size, length). The agent proofs run it on what an agent made; anyone can run it
// on a folder of exports. Everything is opened in headless Chrome or Edge, offline: an export that needs the
// network fails.
//
//   node tools/check-exports.ts <folder> [--out <report.md>]
//
// - .loopweft: `loopweft validate` (errors and warnings);
// - .html: a one-file presentation that opens on its start page and draws its stage (as a rehearsal), offline,
//   asking for nothing but itself, and logging no errors;
// - .png: the PNG signature, then decoded by the browser (its size in pixels);
// - .gif: the GIF signature and its blocks read through to the trailer (its frames), then decoded;
// - .svg: parsed as XML: an SVG root with a viewBox of four numbers, and the texts and shapes it holds;
// - .pdf: the PDF signature and its page count (pdf-lib);
// - .mp4, .webm: the signature, then played in the browser until a frame is decoded (its size and length).
// Every wait is bounded. Prints a Markdown table (and writes it with --out); exits 1 if any file fails a check,
// or if the folder holds no export at all.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { type Browser, chromium, type Page } from '@playwright/test';
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
/** How long the browser gets for each wait: reading a file, a seek, a decoded frame. */
const WAIT = 20_000;

interface Row {
  file: string;
  ok: boolean;
  what: string;
}

const EXPORTS = new Set(['.loopweft', '.html', '.png', '.gif', '.svg', '.pdf', '.mp4', '.webm']);
const kb = (bytes: number) => `${Math.round(bytes / 1024).toLocaleString('en')} KB`;
const starts = (bytes: Buffer, magic: number[] | string, at = 0) =>
  bytes.length >= at + magic.length &&
  (typeof magic === 'string' ? [...Buffer.from(magic, 'latin1')] : magic).every(
    (b, i) => bytes[at + i] === b,
  );

/** Every file under the folder, nested ones too, in name order. */
function filesIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .flatMap((d) => (d.isDirectory() ? filesIn(join(dir, d.name)) : [join(dir, d.name)]));
}

/** A GIF's size and frames, read block by block through to its trailer; throws where it is cut short or wrong. */
function gifInfo(b: Buffer): { width: number; height: number; frames: number } {
  const need = (p: number, n: number, what: string) => {
    if (p + n > b.length) throw new Error(`cut short in ${what}`);
  };
  need(0, 13, 'its header');
  const width = b.readUInt16LE(6);
  const height = b.readUInt16LE(8);
  let p = 13;
  const flags = b[10] as number;
  if (flags & 0x80) p += 3 * 2 ** ((flags & 7) + 1);
  /** Data sub-blocks, up to and including their 0 terminator. */
  const subBlocks = (what: string) => {
    for (;;) {
      need(p, 1, what);
      const size = b[p] as number;
      p += 1;
      if (size === 0) return;
      need(p, size, what);
      p += size;
    }
  };
  let frames = 0;
  for (;;) {
    need(p, 1, 'its blocks');
    const block = b[p];
    if (block === 0x3b) break;
    if (block === 0x21) {
      need(p, 2, 'an extension');
      p += 2;
      subBlocks('an extension');
    } else if (block === 0x2c) {
      need(p, 10, 'an image descriptor');
      const local = b[p + 9] as number;
      p += 10;
      if (local & 0x80) {
        const table = 3 * 2 ** ((local & 7) + 1);
        need(p, table, 'a colour table');
        p += table;
      }
      need(p, 1, 'image data');
      p += 1;
      subBlocks('image data');
      frames++;
    } else throw new Error(`an unknown block (0x${(block as number).toString(16)})`);
  }
  if (frames === 0) throw new Error('no frames');
  return { width, height, frames };
}

/** The browser's verdict on an image: decoded, with its size, or why not. */
async function decodeImage(page: Page, url: string): Promise<{ width: number; height: number }> {
  const got = await page.evaluate(
    async ({ src, wait }) => {
      const image = new Image();
      image.src = src;
      try {
        await Promise.race([
          image.decode(),
          new Promise((_, no) => setTimeout(() => no(new Error('decoding timed out')), wait)),
        ]);
        return { width: image.naturalWidth, height: image.naturalHeight };
      } catch (error) {
        return { error: String((error as Error).message ?? error) };
      }
    },
    { src: url, wait: WAIT },
  );
  if ('error' in got) throw new Error(`the browser could not decode it: ${got.error}`);
  if (!(got.width > 0 && got.height > 0)) throw new Error('decoded to nothing');
  return got;
}

/** The browser's verdict on a video: a frame decoded while playing, its size and length, or why not. */
async function playVideo(
  page: Page,
  url: string,
): Promise<{ width: number; height: number; seconds: number }> {
  const got = await page.evaluate(
    async ({ src, wait }) => {
      const v = document.createElement('video');
      v.muted = true;
      v.preload = 'auto';
      document.body.append(v);
      const within = <T>(p: Promise<T>, what: string) =>
        Promise.race([
          p,
          new Promise<T>((_, no) => setTimeout(() => no(new Error(`${what} timed out`)), wait)),
        ]);
      // Listeners go on before what fires them, with the media's own error as the other way out.
      const next = (event: string) =>
        new Promise<void>((ok, no) => {
          v.addEventListener(event, () => ok(), { once: true });
          v.addEventListener('error', () => no(new Error(v.error?.message || 'a media error')), {
            once: true,
          });
        });
      try {
        const header = next('loadedmetadata');
        v.src = src;
        await within(header, 'reading its header');
        let seconds = v.duration;
        if (!Number.isFinite(seconds)) {
          // A WebM written as it is made may give no length until its end is read.
          const end = next('seeked');
          v.currentTime = 1e9;
          await within(end, 'finding its end');
          seconds = Number.isFinite(v.duration)
            ? v.duration
            : v.seekable.length
              ? v.seekable.end(v.seekable.length - 1)
              : Number.NaN;
          const back = next('seeked');
          v.currentTime = 0;
          await within(back, 'seeking back');
        }
        if (!(seconds > 0)) return { error: 'no length' };
        const frame = new Promise<void>((ok) => v.requestVideoFrameCallback(() => ok()));
        await within(v.play(), 'starting to play');
        await within(frame, 'decoding a frame');
        v.pause();
        return { width: v.videoWidth, height: v.videoHeight, seconds };
      } catch (error) {
        return { error: String((error as Error).message ?? error) };
      }
    },
    { src: url, wait: WAIT },
  );
  if ('error' in got) throw new Error(`it does not play in Chrome: ${got.error}`);
  return got;
}

const rows: Row[] = [];
let checked = 0;
const browser: Browser = await chromium.launch({ executablePath: findBrowser() });
// Offline: an export that asks the network for anything is caught asking.
const context = await browser.newContext({ offline: true, viewport: { width: 1280, height: 720 } });
const media = await context.newPage();
await media.goto(pathToFileURL(join(folder, '.')).href).catch(() => {});
try {
  for (const path of filesIn(folder)) {
    const file = path.slice(folder.length + 1).replace(/\\/g, '/');
    const ext = extname(path).toLowerCase();
    if (!EXPORTS.has(ext)) {
      rows.push({ file, ok: true, what: 'not an export (skipped)' });
      continue;
    }
    checked++;
    let size = '';
    const row = (ok: boolean, what: string) =>
      rows.push({ file, ok, what: size ? `${what} (${size})` : what });
    try {
      size = kb(statSync(path).size);
      const bytes = readFileSync(path);
      const url = pathToFileURL(path).href;
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
        const page = await context.newPage();
        const errors: string[] = [];
        const asked: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('console', (m) => {
          if (m.type() === 'error') errors.push(m.text());
        });
        page.on('request', (r) => {
          if (!/^(file|data|blob):/.test(r.url())) asked.push(r.url());
        });
        const shows = (selector: string) =>
          page
            .locator(selector)
            .first()
            .waitFor({ timeout: WAIT })
            .then(() => true)
            .catch(() => false);
        // Its start page, then the stage, as a rehearsal (one window, no console to wait for).
        await page.goto(url);
        const start = await shows('.lp-start');
        await page.goto(`${url}?view=audience&rehearse`);
        const stage = await shows('.lw-stage');
        const doctype = bytes.subarray(0, 15).toString('latin1').toLowerCase() === '<!doctype html>';
        await page.close();
        row(
          doctype && start && stage && errors.length === 0 && asked.length === 0,
          [
            doctype ? '' : 'no doctype',
            start ? 'opens on its start page' : 'no start page',
            stage ? 'draws its stage (rehearsal), offline' : 'no stage drawn',
            asked.length ? `asks the network for ${asked.length} thing(s), e.g. ${asked[0]}` : '',
            errors.length ? `errors: ${errors.slice(0, 2).join(' | ')}` : '',
          ]
            .filter(Boolean)
            .join('; '),
        );
      } else if (ext === '.png') {
        if (!starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) throw new Error('not a PNG');
        const image = await decodeImage(media, url);
        row(true, `PNG ${image.width} × ${image.height}, decoded`);
      } else if (ext === '.gif') {
        if (!starts(bytes, 'GIF89a') && !starts(bytes, 'GIF87a')) throw new Error('not a GIF');
        const g = gifInfo(bytes);
        await decodeImage(media, url);
        row(true, `GIF ${g.width} × ${g.height}, ${g.frames} frames, decoded`);
      } else if (ext === '.svg') {
        const parsed = await media.evaluate((text) => {
          const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
          if (doc.getElementsByTagName('parsererror').length) return { error: 'not well-formed XML' };
          const root = doc.documentElement;
          if (root.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg')
            return { error: `its root is <${root.localName}>, not an SVG` };
          const view = (root.getAttribute('viewBox') ?? '')
            .trim()
            .split(/[\s,]+/)
            .map(Number);
          if (
            view.length !== 4 ||
            view.some((n) => !Number.isFinite(n)) ||
            !((view[2] ?? 0) > 0 && (view[3] ?? 0) > 0)
          )
            return { error: 'no viewBox of four numbers' };
          return {
            view: view.join(' '),
            texts: root.getElementsByTagName('text').length,
            shapes: root.querySelectorAll('path, circle, ellipse, rect, polygon, polyline, line').length,
          };
        }, bytes.toString('utf8'));
        if ('error' in parsed) throw new Error(parsed.error);
        row(true, `SVG, viewBox ${parsed.view}: ${parsed.texts} texts, ${parsed.shapes} shapes`);
      } else if (ext === '.pdf') {
        if (!starts(bytes, '%PDF-')) throw new Error('not a PDF');
        const pages = (await PDFDocument.load(bytes, { updateMetadata: false })).getPageCount();
        row(pages > 0, `PDF, ${pages} page${pages === 1 ? '' : 's'}`);
      } else {
        const ok = ext === '.mp4' ? starts(bytes, 'ftyp', 4) : starts(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
        if (!ok) throw new Error(`not ${ext === '.mp4' ? 'an MP4' : 'a WebM'}`);
        const v = await playVideo(media, url);
        row(
          v.width > 0,
          `${ext.slice(1).toUpperCase()} ${v.width} × ${v.height}, ${v.seconds.toFixed(1)} s, plays in Chrome`,
        );
      }
    } catch (error) {
      row(false, `could not be read: ${(error as Error).message.split('\n')[0]}`);
    }
  }
} finally {
  await browser.close();
}
if (checked === 0) rows.push({ file: '(the folder)', ok: false, what: 'no export to check in it' });

const report = [
  `| File | Check | What it holds |`,
  `|---|---|---|`,
  ...rows.map((r) => `| ${r.file} | ${r.ok ? 'ok' : '**FAILED**'} | ${r.what.replace(/\|/g, '\\|')} |`),
  '',
].join('\n');
process.stdout.write(report);
if (out) writeFileSync(resolve(out), report);
process.exit(rows.every((r) => r.ok) ? 0 : 1);
