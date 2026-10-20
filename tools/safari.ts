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
// page, the slides and the console are kept for a person to look at: nothing reads those screens, so they are
// reported as made, not as passed. Screens and a report (report.md, report.json) go to the out folder. It fails
// when a check marked required fails; the others are reported.
//
// On a Mac of your own it touches only what it makes: folders of its own (in the temporary folder, Downloads
// and the home folder, each with a fresh name, removed at the end), a driver on a free port, and the Safari
// tabs it opens (it never quits Safari). Only the temporary folder must take a copy: where Downloads or the
// home folder refuses one (privacy settings, a read-only folder), that is reported and the run goes on.
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readProject, referenceList } from '../packages/model/src/index.ts';
import { playerTemplate } from '../packages/player/build/template.ts';
import { deckOf } from '../packages/player/src/deck.ts';
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
/** The driver's address, once it runs on a port of its own. */
let base = '';
/** The longest a single WebDriver command may take before the run stops with its name. */
const COMMAND_MS = 60_000;

/** A port no other program is listening on, as the system hands one out. */
function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() =>
        typeof address === 'object' && address ? done(address.port) : fail(new Error('no port')),
      );
    });
  });
}

interface Result {
  check: string;
  /**
   * What came of it: a check that read the page passes or fails; one that only made a screen, for a person to
   * look at, says so (never "pass"); one that could not run says that.
   */
  result: 'pass' | 'fail' | 'screen made' | 'not run';
  required: boolean;
  detail: string;
}
const results: Result[] = [];

/** Shown in the report: what came of a check, in a word or two. */
const SAID: Record<Result['result'], string> = {
  pass: 'pass',
  fail: 'FAIL',
  'screen made': 'screen made',
  'not run': 'not run',
};

/**
 * A page script's test that an element is on show: neither it nor anything around it hidden or transparent
 * (a label whose map has faded out is not). Safari has had checkVisibility since 17.4; without it, the check
 * fails rather than guess.
 */
const SHOWN = `(el) => {
  if (typeof el.checkVisibility !== 'function') throw new Error('this Safari has no checkVisibility');
  return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function check(
  name: string,
  required: boolean,
  fn: () => Promise<string>,
  screenOnly = false,
): Promise<void> {
  try {
    const detail = await fn();
    results.push({ check: name, result: screenOnly ? 'screen made' : 'pass', required, detail });
  } catch (error) {
    results.push({ check: name, result: 'fail', required, detail: (error as Error).message });
  }
}

/**
 * The file opened as a person opens it: `open -a Safari`, as a double-click does, which lets the file into
 * Safari's sandbox (WebDriver cannot). Without WebDriver there is no page to read, and on GitHub's Mac
 * AppleScript cannot reach Safari (its permission prompt times out), so these checks keep a screen of the
 * whole display for a person to look at: nothing on it is read automatically. `open` drops a file address's
 * query, so each view is reached through a small file beside the page that sends Safari on to it (the way a
 * click on the start page's buttons does).
 */
async function byDoubleClick(file: string): Promise<void> {
  const folder = dirname(file);
  const page = encodeURIComponent(basename(file));
  const views: Array<[string, string, string]> = [
    ['6-from-disk-start', '', 'the start page'],
    ['7-from-disk-slides', '?view=audience#S05.6b', 'the slides at S05.6b'],
    ['8-from-disk-console', '?view=presenter#S04.2a', 'the console at S04.2a'],
  ];
  for (const [screen, view, what] of views) {
    await check(
      `from disk, opened as a person opens it: ${what} (screen ${screen}, to look at)`,
      false,
      async () => {
        let target = file;
        if (view) {
          target = join(folder, `${screen}.html`);
          writeFileSync(
            target,
            `<!doctype html><meta charset="utf-8"><script>location.replace(${JSON.stringify(`${page}${view}`)})</script>`,
          );
        }
        const opened = spawnSync('open', ['-a', 'Safari', target], { encoding: 'utf8' });
        if (opened.status !== 0) throw new Error(opened.stderr.trim() || `open failed (${opened.status})`);
        await sleep(8000);
        const png = join(out, `${screen}.png`);
        const captured = spawnSync('screencapture', ['-x', png], { encoding: 'utf8' });
        if (captured.status !== 0 || !existsSync(png) || statSync(png).size === 0)
          throw new Error(captured.stderr?.trim() || `screencapture made no screen (${captured.status})`);
        return `${statSync(png).size} bytes, after opening ${basename(target)}${view ? `, which goes on to ${view}` : ''}; what it shows is not checked: look at it`;
      },
      true,
    );
  }
}

async function wd(method: string, path: string, body?: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(COMMAND_MS),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    throw new Error(`${method} ${path}: no answer from safaridriver (${(error as Error).message})`);
  }
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
  const deck = deckOf(read.project);
  /** The caption a step's scene shows on the stage: "02 · From idea to institutions". */
  const captionOf = (hash: string) => {
    const scene = deck.scenes.find((sc) => hash.startsWith(`#${sc.id}.`));
    if (!scene) throw new Error(`no scene for ${hash}`);
    return `${String(scene.number).padStart(2, '0')} · ${scene.title}`;
  };
  const name = 'Global Polycrisis.html';
  // The file, in a temporary folder and where a person keeps files: each a new folder of this run's own
  // (a fresh name, never one that was there), and only those are removed at the end.
  const places = [
    { key: 'temporary', label: 'a temporary folder', parent: tmpdir() },
    { key: 'downloads', label: 'Downloads', parent: join(homedir(), 'Downloads') },
    { key: 'home', label: 'the home folder', parent: homedir() },
  ];
  /** The folders this run made, to remove; and those that hold a copy of the file. */
  const folders: Array<{ key: string; label: string; path: string }> = [];
  const copies: typeof folders = [];
  let driver: ChildProcess | null = null;
  let served: Awaited<ReturnType<typeof serve>> | null = null;
  let session = '';
  try {
    for (const place of places) {
      if (!existsSync(place.parent)) continue;
      try {
        const path = mkdtempSync(join(place.parent, 'loopweft-safari-'));
        const folder = { key: place.key, label: place.label, path };
        folders.push(folder);
        writeFileSync(join(path, name), made.html);
        copies.push(folder);
      } catch (error) {
        // The temporary folder must take one: the checks below need a copy somewhere.
        if (place.key === 'temporary') throw error;
        results.push({
          check: `a copy of the file in ${place.label}`,
          result: 'fail',
          required: false,
          detail: `${(error as Error).message}; the run goes on without it`,
        });
      }
    }

    // The driver, on a free port; if it stops, this run stops rather than talk to another one.
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    const started: ChildProcess = spawn('safaridriver', ['--port', String(port)], { stdio: 'inherit' });
    driver = started;
    let ended = '';
    started.once('error', (error) => {
      ended = error.message;
    });
    started.once('exit', (code, signal) => {
      ended = `it stopped (${signal ?? code})`;
    });
    for (let i = 0; ; i++) {
      if (ended)
        throw new Error(
          `safaridriver did not start: ${ended}. On your own Mac, run "safaridriver --enable" once.`,
        );
      if (
        await fetch(`${base}/status`, { signal: AbortSignal.timeout(2000) }).then(
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
    for (const dir of copies) {
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
      result: page ? 'pass' : 'fail',
      required: false,
      detail: tried.join('; '),
    });
    if (!page) {
      served = await serve(copies[0]?.path as string);
      page = `${served.url}/${encodeURIComponent(name)}`;
      await go(page);
    }

    await check('the start page: title, counts and sources', true, async () => {
      await until('return !!document.querySelector(".lp-ref-list")', 'the sources');
      const h1 = await run<string>('return document.querySelector("h1").textContent');
      const meta = await run<string>('return document.querySelector(".lp-start-meta").textContent');
      const refs = await run<number>('return document.querySelectorAll(".lp-ref-list > li").length');
      const works = referenceList(read.project).length;
      if (h1 !== read.project.meta.title) throw new Error(`the title reads "${h1}"`);
      if (meta !== '11 scenes · 70 steps · 14:00 in all') throw new Error(`the counts read "${meta}"`);
      if (refs !== works) throw new Error(`${refs} sources listed, of ${works}`);
      return `${h1}; ${meta}; ${refs} sources`;
    });
    await shot('1-start');

    await check('the slides: the stage, each key, and categories in words', true, async () => {
      // From a step with more after it, so that each key has somewhere to go.
      await go(`${page}?view=audience&rehearse#S01.1`);
      await until('return !!document.querySelector(".lw-stage .map-label")', 'the stage');
      await until('return location.hash === "#S01.1"', 'the slides at S01.1');
      await press(KEY.pageDown);
      const afterPageDown = await hash();
      if (afterPageDown !== '#S01.2') throw new Error(`PageDown went from #S01.1 to ${afterPageDown}`);
      await press(KEY.arrowRight);
      const afterArrow = await hash();
      if (afterArrow !== '#S01.3') throw new Error(`→ went from #S01.2 to ${afterArrow}`);
      await press('c');
      await until('return !!document.querySelector(".lw-stage.category-words")', 'categories in words');
      await sleep(1500);
      // The words themselves, under labels on show: the example's category names, not only the mode's switch.
      // On show means all of it: the line, its label and the map around them (a faded map shows nothing).
      const names = read.project.types.categories.map((c) => c.name);
      const categoriesShown = `[...document.querySelectorAll('.lw-stage .map-label-category:not([hidden])')]
        .filter(${SHOWN}).map((el) => el.textContent)`;
      const shown = await run<string[]>(`return ${categoriesShown}`);
      const named = [...new Set(shown.filter((t) => names.includes(t)))];
      if (named.length === 0)
        throw new Error(`no category named under a label on show (${shown.slice(0, 3).join(', ')})`);
      // The same test with the map faded out finds none: it looks at everything around a label.
      const underFadedMap = await run<string[]>(`
        const map = document.querySelector('.lw-stage .map');
        const before = map.style.opacity;
        map.style.opacity = '0';
        try { return ${categoriesShown}; } finally { map.style.opacity = before; }`);
      if (underFadedMap.length > 0)
        throw new Error(
          `the test counts words under a faded map as shown (${underFadedMap.slice(0, 3).join(', ')})`,
        );
      return `#S01.1 → PageDown ${afterPageDown} → → ${afterArrow}; categories named: ${named.join(', ')}; none counted under a faded map`;
    });
    await shot('2-slides');

    await check('rehearsal notes on N', true, async () => {
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

    await check('the audience window the console opens, kept in step', true, async () => {
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
      if (console_ === there) throw new Error(`the console did not move from ${there}`);
      await wd('POST', `${s}/window`, { handle: audience });
      await until(
        `return decodeURIComponent(location.hash) === ${JSON.stringify(console_)}`,
        'the audience window to follow',
      ).catch(async () => {
        throw new Error(
          `the console went to ${console_}, the audience window stayed at ${await hash()} (it opened at ${there})`,
        );
      });
      // Its address follows before it draws: the step itself must be on its stage, and on the console's.
      const caption = captionOf(console_);
      const captionShown = (stage: string) =>
        `return [...document.querySelectorAll(${JSON.stringify(`${stage} .caption-kicker`)})]
          .some((el) => el.textContent === ${JSON.stringify(caption)} && (${SHOWN})(el))`;
      await until(captionShown('.lw-stage'), `the audience window to show "${caption}"`);
      await shot('5-audience-window');
      await wd('POST', `${s}/window`, { handle: opener });
      await until(captionShown('.lp-preview .lw-stage'), `the console's preview to show "${caption}"`);
      return `opened at ${there}; the console moved to ${console_}, and both windows show "${caption}"`;
    });
  } finally {
    if (session) await wd('DELETE', `/session/${session}`).catch(() => {});
    driver?.kill();
    await served?.close();
    try {
      const home = copies.find((f) => f.key === 'home');
      if (home) await byDoubleClick(join(home.path, name));
      else
        results.push({
          check: 'from disk, opened as a person opens it',
          result: 'not run',
          required: false,
          detail: 'there is no copy of the file in the home folder',
        });
    } finally {
      // Only the folders this run made, with what it wrote in them.
      for (const dir of folders) rmSync(dir.path, { recursive: true, force: true });
    }
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
      `| ${r.check}${r.required ? '' : ' (reported)'} | ${SAID[r.result]} | ${r.detail.replace(/\|/g, '/')} |`,
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
process.exitCode = crashed || results.some((r) => r.required && r.result === 'fail') ? 1 : 0;
