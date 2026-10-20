/// <reference types="vite/client" />
// The player's page. One page, several views, chosen by the address: none (the start page), ?view=presenter
// (the presenter console), ?view=audience (the slides, kept in step with the console), ?view=audience&rehearse
// (the slides alone, with rehearsal notes on N), ?view=audience&capture (stills, at the step the address names). The project is embedded in the page (the one-file export); served on
// this machine, the page has none and plays the polycrisis example.
import '@fontsource-variable/inter/opsz.css';
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/fraunces/opsz-italic.css';
import '@loopweft/render/render.css';
import '../src/player.css';
import { issueLines, readProject } from '@loopweft/model';
import { h } from '@loopweft/render';
import {
  deckOf,
  embeddedProject,
  parseKey,
  presentationId,
  startAudience,
  startConsole,
  startPage,
} from '../src/index.ts';

/** True on the page served on this machine (npm run player), false in a built page: see vite.config.ts. */
declare const __PLAYER_SERVED__: boolean;

const host = document.getElementById('player') as HTMLElement;
const params = new URLSearchParams(location.search);

function problem(title: string, details: string): void {
  document.body.replaceChildren(
    h(
      'div',
      { class: 'lp-problem', role: 'alert' },
      h('p', null, title),
      details ? h('pre', null, details) : null,
    ),
  );
}

async function start(): Promise<void> {
  const own = embeddedProject(document);
  const text =
    own?.text ??
    (__PLAYER_SERVED__ ? (await import('../../../examples/polycrisis.loopweft?raw')).default : null);
  const notes = own ? own.notes : true;
  if (!text) {
    problem('This page holds no project to present.', '');
    return;
  }
  const result = readProject(text);
  if (!result.ok) {
    problem(
      'The project in this page could not be opened.',
      issueLines(result.issues.filter((i) => i.severity === 'error').slice(0, 20)),
    );
    return;
  }
  const project = result.project;
  const show = presentationId(text);
  document.title = project.meta.title;
  if (params.get('view') === 'presenter') {
    document.title = `Presenter · ${project.meta.title}`;
    startConsole({
      host,
      project,
      show,
      // The same page, as the audience window: relative, so it works from a file opened from disk.
      audience: { url: '?view=audience', name: `loopweft-audience-${show}` },
    });
    return;
  }
  if (params.get('view') === 'audience') {
    host.className = 'lp-audience';
    startAudience({ host, project, show, rehearse: params.has('rehearse'), capture: params.has('capture') });
    return;
  }
  // An address naming a step (a link to the old viewer, demo/#S04.2a) opens the slides at that step.
  if (location.hash && parseKey(deckOf(project), location.hash)) {
    location.replace(`?view=audience${location.hash}`);
    return;
  }
  document.body.classList.add('lp-start-body');
  startPage({ host, project, show, notes });
}

start().catch((err: unknown) => {
  console.error(err);
  problem(
    'This presentation could not start in this browser. Please open the file in Chrome or Edge.',
    String(err),
  );
});
