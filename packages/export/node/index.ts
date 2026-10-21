// Drawn exports from Node (the command line, the tests): the export page, opened from a temporary folder in a
// headless Chrome or Edge, does the drawing exactly as it does in the Studio; this side hands it the project
// and the job, and takes the files it makes.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { OpError } from '@loopweft/model';
import { exportPage } from '../build/page.ts';
import type { Job, JobEvent, Opened } from '../src/engine.ts';
import { Chrome, ChromePage, findBrowser } from './chrome.ts';

export { BROWSERS, Chrome, ChromePage, findBrowser, findBrowserNamed, QUIET_SWITCHES } from './chrome.ts';

export interface BrowserExportOptions {
  /** The browser's program file (default: LOOPWEFT_CHROME, else the Chrome or Edge installed). */
  browser?: string;
}

/** The browser to draw with, or a usage error that says how to name one. */
export function browserForExport(options: BrowserExportOptions = {}): string {
  const browser = options.browser ?? findBrowser();
  if (browser) return browser;
  throw new OpError(
    process.env.LOOPWEFT_CHROME
      ? `LOOPWEFT_CHROME names ${process.env.LOOPWEFT_CHROME}, which is not there.`
      : 'Drawing pictures needs Chrome or Edge, and neither was found on this computer. Install one, or set LOOPWEFT_CHROME to the program file of another.',
    'usage',
  );
}

/** A session with the export page in a headless browser, until `close`. */
export class BrowserExporter {
  readonly #chrome: Chrome;
  readonly #page: ChromePage;
  readonly #folder: string;

  private constructor(chrome: Chrome, page: ChromePage, folder: string) {
    this.#chrome = chrome;
    this.#page = page;
    this.#folder = folder;
  }

  static async start(options: BrowserExportOptions = {}): Promise<BrowserExporter> {
    const executable = browserForExport(options);
    const html = await exportPage();
    const folder = mkdtempSync(join(tmpdir(), 'loopweft-export-page-'));
    const file = join(folder, 'export.html');
    writeFileSync(file, html);
    let chrome: Chrome | null = null;
    try {
      chrome = await Chrome.launch(executable);
      const page = await ChromePage.open(chrome);
      await page.goto(pathToFileURL(file).href);
      return new BrowserExporter(chrome, page, folder);
    } catch (error) {
      await chrome?.close();
      rmSync(folder, { recursive: true, force: true });
      throw error;
    }
  }

  /** Opens a project, from its file's text. */
  open(text: string): Promise<Opened> {
    return this.#page.evaluate<Opened>(`window.loopweftExport.open(${JSON.stringify(text)})`);
  }

  /** Runs a job, handing each file it makes to `onFile` as it comes. */
  async run(job: Job, onFile: (event: JobEvent) => void | Promise<void>): Promise<void> {
    const id = await this.#page.evaluate<string>(`window.loopweftExport.start(${JSON.stringify(job)})`);
    for (;;) {
      const event = await this.#page.evaluate<(Omit<JobEvent, 'bytes'> & { base64: string }) | null>(
        `window.loopweftExport.next(${JSON.stringify(id)})`,
      );
      if (!event) return;
      const { base64, ...rest } = event;
      await onFile({ ...rest, bytes: new Uint8Array(Buffer.from(base64, 'base64')) } as JobEvent);
    }
  }

  async close(): Promise<void> {
    await this.#chrome.close();
    rmSync(this.#folder, { recursive: true, force: true });
  }
}

/** Opens a project in a headless browser, runs one job, and closes the browser. */
export async function exportInBrowser(
  text: string,
  job: Job,
  onFile: (event: JobEvent) => void | Promise<void>,
  options: BrowserExportOptions = {},
): Promise<Opened> {
  const exporter = await BrowserExporter.start(options);
  try {
    const opened = await exporter.open(text);
    await exporter.run(job, onFile);
    return opened;
  } finally {
    await exporter.close();
  }
}
