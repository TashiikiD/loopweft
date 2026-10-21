// A sample of every export of the example, made as `loopweft export` makes them (the same code, in the Chrome or
// Edge on this computer), and a page that shows them with what to check by hand, for the exports' review.
//
//   node tools/review-exports.ts [--out review/phase6] [--quick]
//
// Writes <out>/exports/ (the files) and <out>/index.html (open it in a browser). --quick leaves out the whole
// story as video, which takes several minutes. Keep the output out of the repository, as every review's
// material is (review/ is git-ignored).
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../packages/cli/src/main.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const out = resolve(root, option('out') ?? 'review/phase6');
const quick = args.includes('--quick');
const folder = join(out, 'exports');
rmSync(folder, { recursive: true, force: true });
mkdirSync(folder, { recursive: true });
const project = join(folder, 'polycrisis.loopweft');
writeFileSync(project, readFileSync(join(root, 'examples/polycrisis.loopweft')));

interface Sample {
  group: string;
  file: string;
  what: string;
  /** What `loopweft export` said. */
  said: string;
}

const samples: Sample[] = [];

/** Runs one export through the command line, into the folder. */
async function make(group: string, file: string, what: string, ...options: string[]): Promise<void> {
  const started = Date.now();
  let said = '';
  let err = '';
  const code = await main(['export', project, ...options, '-o', join(folder, file)], {
    out: (t) => (said += t),
    err: (t) => (err += t),
  });
  if (code !== 0) throw new Error(`loopweft export ${options.join(' ')} failed: ${err.trim()}`);
  console.log(`${file} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  samples.push({ group, file, what, said: said.trim() });
}

await make('One HTML file', 'polycrisis.html', 'The presentation: start page, slides, console', '--html');

await make('Pictures (PNG)', 'S05.6b.png', 'A step: the Richards et al. figure', '--png', '--step', 'S05.6b');
await make(
  'Pictures (PNG)',
  'S04.2a-words.png',
  'A step, categories in words',
  '--png',
  '--step',
  'S04.2a',
  '--category-words',
);
await make(
  'Pictures (PNG)',
  'map-trimmed-2x.png',
  'The whole map, trimmed, 3840 wide',
  '--png',
  '--map',
  '--trim',
  '--scale',
  '2',
);

await make('Drawings (SVG)', 'S00.1.svg', 'The title page', '--svg', '--step', 'S00.1');
await make('Drawings (SVG)', 'S04.2a.svg', 'A step with cards and glows', '--svg', '--step', 'S04.2a');
await make('Drawings (SVG)', 'S05.6b.svg', 'A step with an image', '--svg', '--step', 'S05.6b');
await make('Drawings (SVG)', 'map.svg', 'The whole map', '--svg', '--map');

await make('PDF documents', 'slides.pdf', 'The slides: a 16:9 page per step', '--pdf', 'slides');
await make('PDF documents', 'speaker-notes.pdf', 'The speaker notes, on Letter', '--pdf', 'notes');
await make(
  'PDF documents',
  'references-a4.pdf',
  'The references, on A4',
  '--pdf',
  'references',
  '--paper',
  'a4',
);

await make(
  'Video',
  'S04.mp4',
  'Scene 4, each step held 3 s, 1920 × 1080 at 30 fps',
  '--mp4',
  '--scene',
  'S04',
);
await make(
  'Video',
  'S01-talk-720p60.webm',
  'Scene 1 in the talk’s timing, WebM, 1280 × 720 at 60 fps',
  '--webm',
  '--scene',
  'S01',
  '--talk-timing',
  '--height',
  '720',
  '--fps',
  '60',
);
if (!quick) await make('Video', 'story.mp4', 'The whole story, each step held 3 s', '--mp4');

await make(
  'GIF',
  'S04.2a-to-S04.2d.gif',
  'Steps 2a to 2d of scene 4, held 1 s',
  '--gif',
  '--from',
  'S04.2a',
  '--to',
  'S04.2d',
  '--hold',
  '1',
);
await make('GIF', 'S00.gif', 'The title page, its pulses wandering for 3 s', '--gif', '--scene', 'S00');

const htmlText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const megabytes = (file: string) => `${(statSync(join(folder, file)).size / 1_000_000).toFixed(1)} MB`;
const preview = (file: string) => {
  const src = `exports/${encodeURI(file)}`;
  if (/\.(png|svg|gif)$/.test(file)) return `<a href="${src}"><img src="${src}" alt="${htmlText(file)}"></a>`;
  if (file.endsWith('.mp4')) return `<video src="${src}" controls muted preload="metadata"></video>`;
  if (file.endsWith('.webm')) return `<video src="${src}" controls muted preload="metadata"></video>`;
  return `<a href="${src}">Open ${htmlText(file)}</a>`;
};
const groups = [...new Set(samples.map((s) => s.group))];
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Loopweft exports, for review</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; margin: 2rem auto; max-width: 1200px; padding: 0 1rem; color: #1b2a26; background: #f6f8f7; }
  h1 { font-size: 1.6rem; } h2 { margin-top: 2.5rem; border-bottom: 1px solid #cfd8d4; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 1.25rem; }
  figure { margin: 0; background: #fff; border: 1px solid #dfe6e3; border-radius: 8px; padding: .75rem; }
  img, video { width: 100%; height: auto; background: #0c1a17; border-radius: 4px; }
  figcaption { margin-top: .5rem; } code { font-size: .85em; } .said { color: #50605b; font-size: .85em; }
  ol li { margin: .35rem 0; }
</style>
</head>
<body>
<h1>Loopweft exports, for review</h1>
<p>Every export of the example, made by <code>loopweft export</code> on this computer (the Studio's Export tab makes
them the same way). The files are in <code>exports/</code>, beside this page.</p>
<h2>To check by hand</h2>
<ol>
  <li>Open the three PDFs in your PDF reader: the slides (70 pages, a bookmark at each scene; the page number is the
  slide number), the speaker notes (a page per scene, ▶ slide marks in the script) and the references (APA, the scenes
  citing each source, the Images list with the Richards et al. credit).</li>
  <li>Play <code>S04.mp4</code> (and <code>story.mp4</code>) in the Windows Media Player, and insert one into a PowerPoint
  slide (Insert, Video, This Device).</li>
  <li>Insert <code>S04.2a.svg</code> into PowerPoint and Word (Insert, Pictures): the text should stay text you can edit
  after "Convert to Shape"; the glows are left out there, as the drawing's notes say.</li>
  <li>Open the GIFs in a browser or drop one into a chat: they loop, and the held steps rest.</li>
  <li>Double-click <code>polycrisis.html</code>: the start page, the slides and the console, offline.</li>
</ol>
${groups
  .map(
    (group) => `<h2>${htmlText(group)}</h2>
<div class="grid">
${samples
  .filter((s) => s.group === group)
  .map(
    (s) =>
      `<figure>${preview(s.file)}<figcaption><strong>${htmlText(s.file)}</strong> (${megabytes(s.file)}): ${htmlText(s.what)}<br><span class="said">${htmlText(s.said).replace(/\n/g, '<br>')}</span></figcaption></figure>`,
  )
  .join('\n')}
</div>`,
  )
  .join('\n')}
</body>
</html>
`;
writeFileSync(join(out, 'index.html'), html);
console.log(
  `Wrote ${relative(root, join(out, 'index.html'))} and ${samples.length} files in ${basename(folder)}/.`,
);
