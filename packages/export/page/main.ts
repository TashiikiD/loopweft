// The export page: the export engine on a 1920 × 1080 stage, with Loopweft's fonts and the stage's styles.
// The command line calls `window.loopweftExport` through the browser's DevTools protocol (node/); the Studio,
// which holds this page in a hidden frame, sends it messages (apps/studio/src/export/engine.ts). Nothing here
// reaches the network.
import '@fontsource-variable/inter/opsz.css';
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/fraunces/opsz-italic.css';
import '@loopweft/render/render.css';
import './page.css';
import { BRIDGE, type BridgeRequest, eventBuffers, eventToWire } from '../src/bridge.ts';
import { ExportEngine } from '../src/engine.ts';

const engine = new ExportEngine(document.getElementById('stage') as HTMLElement);

/** For the command line: results it can carry as JSON (bytes as base64). */
const api = {
  open: (text: string) => engine.open(text),
  start: (job: Parameters<ExportEngine['start']>[0]) => engine.start(job),
  async next(id: string) {
    const event = await engine.next(id);
    return event ? eventToWire(event) : null;
  },
  cancel: (id: string) => engine.cancel(id),
};
(window as unknown as { loopweftExport: typeof api }).loopweftExport = api;

// For the Studio: requests from the page that holds this one, answered with the bytes themselves.
const parentWindow = window.parent !== window ? window.parent : null;
if (parentWindow) {
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== parentWindow) return;
    const request = event.data as BridgeRequest;
    if (!request || request.bridge !== BRIDGE || typeof request.id !== 'number') return;
    const reply = (body: object, transfer: Transferable[] = []) =>
      parentWindow.postMessage({ bridge: BRIDGE, id: request.id, ...body }, { targetOrigin: '*', transfer });
    const call = async () => {
      switch (request.call) {
        case 'open':
          return engine.open(String(request.args[0]));
        case 'start':
          return engine.start(request.args[0] as Parameters<ExportEngine['start']>[0]);
        case 'next':
          return engine.next(String(request.args[0]));
        case 'cancel':
          return engine.cancel(String(request.args[0]));
        default:
          throw new Error(`The export page has no call "${String(request.call)}".`);
      }
    };
    call().then(
      (result) => reply({ result }, typeof result === 'object' ? eventBuffers(result) : []),
      (error: unknown) => reply({ error: error instanceof Error ? error.message : String(error) }),
    );
  });
  parentWindow.postMessage({ bridge: BRIDGE, ready: true }, '*');
}
