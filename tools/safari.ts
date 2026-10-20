// The one-file HTML in Safari, Apple's own WebKit, driven through the driver macOS ships with (safaridriver),
// so nothing is downloaded: Playwright's WebKit build is partly LGPL, which the licence rule refuses. It runs
// on GitHub's Mac machines (the CI job "safari"); on a Mac of your own, run `safaridriver --enable` once.
//
//   node tools/safari.ts [--out <folder>]
//
// It exports the polycrisis example and drives Safari through the start page, the slides (keys, categories in
// words), the rehearsal notes, the presenter console and the audience window the console opens. WebDriver's
// Safari refuses files on disk ("outside the sandbox"), so those checks run on the file served from this
// machine; then the file is opened from disk as a person opens it (open -a Safari), and screens of the start
// page, the slides and the console are kept for a person to look at. Screens and a report (report.md, report.json) go to the out folder. It fails when
// a check marked required fails; the others are reported.
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readProject } from '../packages/model/src/index.ts';
import { playerTemplate } from '../packages/player/build/template.ts';
import { exportHtml } from '../packages/player/src/export.ts';
import { serve } from './serve.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const out = resolve(
  outIndex >= 0 && args[outIndex + 1] ? (args[outIndex + 1] as string) : join(tmpdir(), 'loopweft-safari'),
);
mkdirSync(out, { recursive: true });

// WebDriver's key codes (the W3C spec's private-use characters).
const KEY = { pageDown: String.fromCharCode(0xe00f), arrowRight: String.fromCharCode(0xe014) };
const ELEMENT = 'element-6066-11e4-a52e-4f735466cecf';
const PORT = 4445;
const base = `http://127.0.0.1:${PORT}`;

interface Result {
  check: string;
  ok: boolean;
  required: boolean;
  detail: string;
}
const results: Result[] = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function check(name: string, required: boolean, fn: () => Promise<string>): Promise<void> {
  try {
    results.push({ check: name, ok: true, required, detail: await fn() });
  } catch (error) {
    results.push({ check: name, ok: false, required, detail: (error as Error).message });
  }
}

/**
 * The file opened as a person opens it: `open -a Safari`, as a double-click does, which lets the file into
 * Safari's sandbox (WebDriver cannot). Without WebDriver there is no page to read, and on GitHub's Mac
 * AppleScript cannot reach Safari (its permission prompt times out), so these checks open each view by its
 * address and keep a screen of the whole display for a person to look at: the start page, the slides at a
 * step, and the console. (The keys and the two windows are checked above, on the file served.)
 */
async function byDoubleClick(file: string): Promise<void> {
  const url = pathToFileURL(file).href;
  const views: Array<[string, string, string]> = [
    ['6-from-disk-start', file, 'the start page'],
    ['7-from-disk-slides', `${url}?view=audience#S05.6b`, 'the slides at S05.6b'],
    ['8-from-disk-console', `${url}?view=presenter#S04.2a`, 'the console at S04.2a'],
  ];
  for (const [screen, address, what] of views) {
    await check(`from disk, opened as a person opens it: ${what} (see screen ${screen})`, false, async () => {
      const opened = spawnSync('open', ['-a', 'Safari', address], { encoding: 'utf8' });
      if (opened.status !== 0) throw new Error(opened.stderr.trim() || `open failed (${opened.status})`);
      await sleep(8000);
      spawnSync('screencapture', ['-x', join(out, `${screen}.png`)]);
      return `opened ${address.replace(/^.*\//, '')}`;
    });
  }
  spawnSync('pkill', ['-x', 'Safari']);
}

async function wd(method: string, path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = (await response.json()) as { value: unknown };
  if (!response.ok) {
    const v = json.value as { error?: string; message?: string };
    throw new Error(`${method} ${path}: ${v.error ?? response.status} ${v.message ?? ''}`.trim());
  }
  return json.value;
}

async function main(): Promise<void> {
  const read = readProject(readFileSync(join(root, 'examples/polycrisis.loopweft'), 'utf8'));
  if (!read.ok) throw new Error('The example does not open.');
  const made = exportHtml(read.project, await playerTemplate(), { notes: true });
  const name = 'Global Polycrisis.html';
  // The file, in a temporary folder and where a person keeps files (each removed again at the end).
  const folders = [
    {
      key: 'temporary',
      label: 'a temporary folder',
      path: mkdtempSync(join(tmpdir(), 'loopweft-safari-html-')),
    },
    { key: 'downloads', label: 'Downloads', path: join(homedir(), 'Downloads', 'loopweft-safari-html') },
    { key: 'home', label: 'the home folder', path: join(homedir(), 'loopweft-safari-html') },
  ];
  for (const dir of folders) {
    mkdirSync(dir.path, { recursive: true });
    writeFileSync(join(dir.path, name), made.html);
  }

  const driver: ChildProcess = spawn('safaridriver', ['--port', String(PORT)], { stdio: 'inherit' });
  let served: Awaited<ReturnType<typeof serve>> | null = null;
  let session = '';
  try {
    for (let i = 0; ; i++) {
      if (
        await fetch(`${base}/status`).then(
          (r) => r.ok,
          () => false,
        )
      )
        break;
      if (i > 50)
        throw new Error('safaridriver did not start (on your own Mac, run "safaridriver --enable" once).');
      await sleep(200);
    }
    const created = (await wd('POST', '/session', {
      capabilities: { alwaysMatch: { browserName: 'safari' } },
    })) as { sessionId: string; capabilities: { browserVersion?: string } };
    session = created.sessionId;
    const s = `/session/${session}`;
    const version = created.capabilities.browserVersion ?? 'unknown';
    const go = (url: string) => wd('POST', `${s}/url`, { url });
    const run = <T>(script: string, ...params: unknown[]) =>
      wd('POST', `${s}/execute/sync`, { script, args: params }) as Promise<T>;
    const until = async (script: string, what: string, ms = 10_000) => {
      for (const start = Date.now(); Date.now() - start < ms; await sleep(200))
        if (await run<boolean>(script)) return;
      throw new Error(`timed out waiting for ${what}`);
    };
    const press = async (key: string) => {
      await wd('POST', `${s}/actions`, {
        actions: [
          {
            type: 'key',
            id: 'keyboard',
            actions: [
              { type: 'keyDown', value: key },
              { type: 'keyUp', value: key },
            ],
          },
        ],
      });
      await sleep(300);
    };
    const shot = async (file: string) => {
      const png = (await wd('GET', `${s}/screenshot`)) as string;
      writeFileSync(join(out, `${file}.png`), Buffer.from(png, 'base64'));
    };
    const hash = () => run<string>('return decodeURIComponent(location.hash)');

    // From disk, if Safari opens a file under automation, trying folders in turn: Safari's sandbox decides
    // which it may read (a file a person double-clicks is let in by macOS; one opened by WebDriver is not).
    // Else from a server on this machine.
    let page = '';
    const tried: string[] = [];
    for (const dir of folders) {
      const url = pathToFileURL(join(dir.path, name)).href;
      await go(url);
      try {
        await until('return !!document.querySelector("h1")', 'the start page', 6000);
        page = url;
        tried.push(`${dir.label}: opens`);
        break;
      } catch {
        // What Safari shows instead: its error page's text, or the player's own problem notice.
        const seen = await run<string>(
          `return (document.querySelector('.lp-problem')?.textContent ?? document.body?.innerText ?? '').replace(/\\s+/g, ' ').slice(0, 200)`,
        ).catch((e: Error) => e.message);
        tried.push(`${dir.label}: refused (${seen})`);
        await shot(`0-from-disk-${dir.key}`).catch(() => {});
      }
    }
    results.push({
      check: `Safari ${version} opens the file from disk`,
      ok: page !== '',
      required: false,
      detail: tried.join('; '),
    });
    if (!page) {
      served = await serve(folders[0]?.path as string);
      page = `${served.url}/${encodeURIComponent(name)}`;
      await go(page);
    }

    await check('the start page: title, counts and sources', true, async () => {
      await until('return !!document.querySelector(".lp-ref-list")', 'the sources');
      const h1 = await run<string>('return document.querySelector("h1").textContent');
      const meta = await run<string>('return document.querySelector(".lp-start-meta").textContent');
      const refs = await run<number>('return document.querySelectorAll(".lp-ref-list > li").length');
      if (!h1.startsWith('Global Polycrisis')) throw new Error(`the title reads "${h1}"`);
      if (meta !== '11 scenes · 70 steps · 14:00 in all') throw new Error(`the counts read "${meta}"`);
      return `${h1}; ${meta}; ${refs} sources`;
    });
    await shot('1-start');

    await check('the slides: the stage, keys and categories in words', true, async () => {
      await go(`${page}?view=audience&rehearse`);
      await until('return !!document.querySelector(".lw-stage .map-label")', 'the stage');
      const before = await hash();
      await press(KEY.pageDown);
      await press(KEY.arrowRight);
      const after = await hash();
      if (after === before) throw new Error(`the keys did not move the slides (${before})`);
      await press('c');
      await until('return !!document.querySelector(".lw-stage.category-words")', 'categories in words');
      await sleep(1500);
      return `${before} → ${after}; categories named`;
    });
    await shot('2-slides');

    await check('rehearsal notes on N', false, async () => {
      await press('n');
      await until('return !document.querySelector(".lp-rehearsal").hidden', 'the notes');
      const heading = await run<string>('return document.querySelector(".lp-rehearsal h2").textContent');
      await shot('3-rehearsal-notes');
      await press('n');
      return heading;
    });

    await check('the presenter console', true, async () => {
      await go(`${page}?view=presenter`);
      await until(
        'return !!document.querySelector(".lp-scene-sub") && !!document.querySelector(".lp-preview .lw-stage")',
        'the console',
      );
      const sub = await run<string>('return document.querySelector(".lp-scene-sub").textContent');
      await press(KEY.pageDown);
      const next = await run<string>('return document.querySelector(".lp-scene-sub").textContent');
      if (next === sub) throw new Error(`the keys did not move the console (${sub})`);
      await sleep(1500);
      return `${sub} → ${next}`;
    });
    await shot('4-console');

    await check('the audience window the console opens, kept in step', false, async () => {
      const opener = (await wd('GET', `${s}/window`)) as string;
      const button = (await wd('POST', `${s}/element`, {
        using: 'xpath',
        value: '//button[normalize-space()="Open audience window"]',
      })) as Record<string, string>;
      await wd('POST', `${s}/element/${button[ELEMENT]}/click`, {});
      await sleep(1500);
      const handles = (await wd('GET', `${s}/window/handles`)) as string[];
      const audience = handles.find((h) => h !== opener);
      if (!audience) throw new Error('no second window opened (Safari may block it under automation)');
      await wd('POST', `${s}/window`, { handle: audience });
      await until('return !!document.querySelector(".lw-stage .map-label")', 'the audience stage');
      const there = await hash();
      await wd('POST', `${s}/window`, { handle: opener });
      await press(KEY.pageDown);
      const console_ = await hash();
      await wd('POST', `${s}/window`, { handle: audience });
      await sleep(800);
      const followed = await hash();
      await shot('5-audience-window');
      if (followed !== console_)
        throw new Error(
          `the console went to ${console_}, the audience window stayed at ${followed} (it opened at ${there})`,
        );
      return `opened at ${there}; the console moved to ${console_} and the audience window followed`;
    });
  } finally {
    if (session) await wd('DELETE', `/session/${session}`).catch(() => {});
    driver.kill();
    await served?.close();
    const home = folders.find((f) => f.key === 'home');
    if (home) await byDoubleClick(join(home.path, name));
    for (const dir of folders) rmSync(dir.path, { recursive: true, force: true });
  }
}

let crashed: Error | null = null;
try {
  await main();
} catch (error) {
  crashed = error as Error;
}
const lines = [
  '# The one-file HTML in Safari',
  '',
  '| Check | Result | Detail |',
  '|---|---|---|',
  ...results.map(
    (r) =>
      `| ${r.check}${r.required ? '' : ' (reported)'} | ${r.ok ? 'pass' : 'FAIL'} | ${r.detail.replace(/\|/g, '/')} |`,
  ),
  ...(crashed ? ['', `Stopped: ${crashed.message}`] : []),
];
writeFileSync(join(out, 'report.md'), `${lines.join('\n')}\n`);
writeFileSync(
  join(out, 'report.json'),
  `${JSON.stringify({ results, crashed: crashed?.message ?? null }, null, 2)}\n`,
);
process.stdout.write(`${lines.join('\n')}\n`);
if (process.env.GITHUB_STEP_SUMMARY)
  writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`, { flag: 'a' });
process.exitCode = crashed || results.some((r) => r.required && !r.ok) ? 1 : 0;
