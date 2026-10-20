// The audience window the Studio's presenter console opens (audience.html?show=<id>). It holds no project of
// its own: it asks the console for the presentation's project, then plays it, kept in step with the console.
// Reloaded, it asks again.
import '@fontsource-variable/inter/opsz.css';
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/fraunces/opsz-italic.css';
import '@loopweft/render/render.css';
import '@loopweft/player/player.css';
import { readProject } from '@loopweft/model';
import { browserHost, joinToken, Link, presentationId, startAudience } from '@loopweft/player';

const host = document.getElementById('player') as HTMLElement;
const show = new URLSearchParams(location.search).get('show') ?? '';

const waiting = document.createElement('p');
waiting.className = 'lp-waiting';
waiting.textContent = 'Waiting for the presenter console in the Studio…';
host.append(waiting);

const link = new Link('audience', show, browserHost(window), { token: joinToken(window, show) });
let started = false;
link.on((msg) => {
  if (msg.t !== 'project' || started) return;
  // Only the project of this presentation (its id is worked out from its text).
  if (presentationId(msg.text) !== show) return;
  const read = readProject(msg.text);
  if (!read.ok) {
    waiting.textContent = 'The presenter console sent a project that could not be opened.';
    return;
  }
  started = true;
  window.clearInterval(asking);
  window.clearTimeout(hint);
  link.stop();
  waiting.remove();
  document.title = read.project.meta.title;
  host.className = 'lp-audience';
  startAudience({ host, project: read.project, show, rehearse: false });
});
link.start();
const ask = () => link.send({ t: 'needProject' });
ask();
const asking = window.setInterval(ask, 1000);
const hint = window.setTimeout(() => {
  waiting.textContent =
    'Waiting for the presenter console in the Studio. Keep the Studio open, with its console showing; this window joins it as soon as it answers.';
}, 5000);
