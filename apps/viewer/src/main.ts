/// <reference types="vite/client" />
// The Loopweft viewer: plays a project's story on the stage, step by step. It opens the polycrisis example,
// or any .loopweft file dropped on the page. With ?capture in the address it shows the step the address
// names at once and keeps time with a timer, for headless stills (tools/capture.ts).
import '@fontsource-variable/inter/opsz.css';
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/fraunces/opsz-italic.css';
import '@loopweft/render/render.css';
import './viewer.css';
import { issueLines, type Project, readProject } from '@loopweft/model';
import { FrameClock, IntervalClock, Motion } from '@loopweft/motion';
import {
  type StoryPosition,
  StoryView,
  storyPositions,
  type Transition,
  themeTokens,
} from '@loopweft/render';
import exampleText from '../../../examples/polycrisis.loopweft?raw';
import { indexFromHash, keyAction } from './navigation.ts';

const host = document.getElementById('viewer') as HTMLElement;
const capture = new URLSearchParams(location.search).has('capture');
const motion = new Motion(capture ? new IntervalClock(60) : new FrameClock());

const hud = document.createElement('div');
hud.className = 'hud';
const help = document.createElement('div');
help.className = 'help';
help.innerHTML =
  '<b>→</b> next · <b>←</b> back · <b>R</b> replay · <b>P</b> pause · <b>S</b> skip · <b>L</b> low power · ' +
  '<b>C</b> categories in words · ' +
  '<b>F</b> full screen · <b>?</b> this help<br>Drop a <code>.loopweft</code> file here to open it.';
const problems = document.createElement('pre');
problems.className = 'problems';
problems.hidden = true;
if (!capture) document.body.append(hud, help, problems);

let story: StoryView | null = null;
let positions: StoryPosition[] = [];
let index = 0;
let paused = false;
let lowPower = false;
let categoryWords = false;

function show(i: number, transition: Transition): void {
  if (!story || positions.length === 0) return;
  index = Math.max(0, Math.min(positions.length - 1, i));
  const p = positions[index] as StoryPosition;
  story.show(p.scene, p.step, transition);
  history.replaceState(null, '', `${location.pathname}${location.search}#${p.key}`);
  const step = story.project.story.scenes[p.scene]?.steps[p.step];
  hud.textContent = `${p.key} · ${step?.label ?? ''} · ${index + 1} / ${positions.length}`;
  wake();
}

function open(project: Project): void {
  story?.dispose();
  motion.landAll();
  story = new StoryView(host, { project, motion });
  story.setLowPower(lowPower);
  story.setCategoryWords(categoryWords);
  positions = storyPositions(project);
  document.title = project.meta.title;
  document.body.style.background = themeTokens(project).bgDeep;
  if (positions.length === 0) {
    // No story yet: the whole map, plainly.
    story.map.apply({}, 'instant');
    hud.textContent = `${project.meta.title} · no story steps`;
  } else show(indexFromHash(location.hash, positions), 'instant');
  // Label sizes depend on the web fonts; place them again once the fonts are in.
  void document.fonts?.ready.then(() => story?.relayout());
}

function report(name: string, text: string): void {
  problems.textContent = `${name} could not be opened:\n\n${text}`;
  problems.hidden = false;
}

/** Opens a project's text; a dropped file starts at its first step, the example where the address says. */
function load(text: string, name: string, from: 'address' | 'start'): void {
  const result = readProject(text);
  if (!result.ok) {
    report(name, issueLines(result.issues.filter((i) => i.severity === 'error').slice(0, 20)));
    return;
  }
  problems.hidden = true;
  if (from === 'start') history.replaceState(null, '', `${location.pathname}${location.search}`);
  open(result.project);
}

let idle = 0;
function wake(): void {
  document.body.classList.remove('idle');
  window.clearTimeout(idle);
  idle = window.setTimeout(() => document.body.classList.add('idle'), 2500);
}

document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  const action = keyAction(e);
  if (!action) return;
  e.preventDefault();
  wake();
  help.classList.add('gone');
  switch (action.kind) {
    case 'next':
      if (index < positions.length - 1) show(index + 1, 'smooth');
      return;
    case 'previous':
      if (index > 0) show(index - 1, 'quick');
      return;
    case 'first':
      show(0, 'quick');
      return;
    case 'last':
      show(positions.length - 1, 'quick');
      return;
    case 'replay':
      if (index > 0) show(index - 1, 'instant');
      show(index + (index > 0 ? 1 : 0), 'smooth');
      return;
    case 'pause':
      paused = !paused;
      motion.setPaused(paused);
      document.body.classList.toggle('paused', paused);
      return;
    case 'skip':
      motion.landAll();
      return;
    case 'lowPower':
      lowPower = !lowPower;
      story?.setLowPower(lowPower);
      return;
    case 'categoryWords':
      categoryWords = !categoryWords;
      story?.setCategoryWords(categoryWords);
      return;
    case 'fullscreen':
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen().catch(() => {});
      return;
    case 'help':
      help.classList.toggle('gone');
      return;
  }
});

window.addEventListener('hashchange', () => {
  const i = indexFromHash(location.hash, positions);
  if (i !== index) show(i, 'instant');
});
document.addEventListener('mousemove', wake);
document.addEventListener('dblclick', () => {
  if (!document.fullscreenElement) void document.documentElement.requestFullscreen().catch(() => {});
});
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  document.body.classList.add('dropping');
});
document.addEventListener('dragleave', () => document.body.classList.remove('dropping'));
document.addEventListener('drop', (e) => {
  e.preventDefault();
  document.body.classList.remove('dropping');
  const file = e.dataTransfer?.files[0];
  if (!file) return;
  file.text().then(
    (text) => load(text, file.name, 'start'),
    (err: unknown) => report(file.name, String(err)),
  );
});

load(exampleText, 'The example', 'address');
window.setTimeout(() => help.classList.add('gone'), 8000);
