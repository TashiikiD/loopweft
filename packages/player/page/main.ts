/// <reference types="vite/client" />
// The player's page. One page, several views, chosen by the address: ?view=audience (the slides, kept in step
// with the console), ?view=audience&rehearse (the slides alone, with rehearsal notes on N), ?view=audience&capture
// (stills, at the step the address names). The project is embedded in the page (the one-file export); served on
// this machine, the page has none and plays the polycrisis example.
import '@fontsource-variable/inter/opsz.css';
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/fraunces/opsz-italic.css';
import '@loopweft/render/render.css';
import '../src/player.css';
import { issueLines, readProject } from '@loopweft/model';
import { h } from '@loopweft/render';
import { presentationId, startAudience } from '../src/index.ts';

const host = document.getElementById('player') as HTMLElement;
const params = new URLSearchParams(location.search);

/** The page's own project, if the export put one in it. */
function embedded(): string | null {
  const text = document.getElementById('loopweft-project')?.textContent?.trim();
  return text ? text : null;
}

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
  const text =
    embedded() ??
    (import.meta.env.DEV ? (await import('../../../examples/polycrisis.loopweft?raw')).default : null);
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
  document.title = project.meta.title;
  host.className = 'lp-audience';
  startAudience({
    host,
    project,
    show: presentationId(text),
    rehearse: params.get('view') !== 'audience' || params.has('rehearse'),
    capture: params.has('capture'),
  });
}

start().catch((err: unknown) => {
  console.error(err);
  problem(
    'This presentation could not start in this browser. Please open the file in Chrome or Edge.',
    String(err),
  );
});
