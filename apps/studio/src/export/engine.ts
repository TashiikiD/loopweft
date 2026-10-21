// The Studio's way to the export engine: the export page (@loopweft/export's page/, the same page the command
// line runs in a headless browser) in a hidden frame of 1920 × 1080, so pictures are drawn exactly as
// `loopweft export` draws them. Requests go to the frame as messages; each is answered once.
import {
  BRIDGE,
  type BridgeCall,
  type BridgeReply,
  type Job,
  type JobEvent,
  type Opened,
} from '@loopweft/export';

/** What the Export workspace needs from an engine (tests give it a stand-in). */
export interface Engine {
  open(text: string): Promise<Opened>;
  start(job: Job): Promise<string>;
  next(id: string): Promise<JobEvent | null>;
  cancel(id: string): Promise<void>;
  dispose(): void;
}

/** The export page (a separate download, loaded the first time it is needed). */
export const loadExportPage = async (): Promise<string> =>
  (await import('virtual:loopweft-export-page')).default;

/** Starts the export page in a hidden frame of `doc`, once it says it is ready. */
export function frameEngine(page: string, doc: Document = document): Promise<Engine> {
  const frame = doc.createElement('iframe');
  frame.title = 'Export';
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  // Laid out at its true size (the stage is measured), but off the screen and out of the way.
  frame.style.cssText =
    'position:fixed;left:-30000px;top:0;width:1920px;height:1080px;border:0;pointer-events:none;';
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  let next = 1;
  let ready: () => void = () => undefined;
  const started = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const win = doc.defaultView as Window;
  const onMessage = (event: MessageEvent) => {
    if (event.source !== frame.contentWindow) return;
    const reply = event.data as BridgeReply;
    if (!reply || reply.bridge !== BRIDGE) return;
    if ('ready' in reply) {
      ready();
      return;
    }
    const waiting = pending.get(reply.id);
    if (!waiting) return;
    pending.delete(reply.id);
    if ('error' in reply) waiting.reject(new Error(reply.error));
    else waiting.resolve(reply.result);
  };
  win.addEventListener('message', onMessage);
  frame.srcdoc = page;
  doc.body.appendChild(frame);

  const call = <T>(name: BridgeCall, ...args: unknown[]): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const id = next++;
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      frame.contentWindow?.postMessage({ bridge: BRIDGE, id, call: name, args }, '*');
    });

  const engine: Engine = {
    open: (text) => call<Opened>('open', text),
    start: (job) => call<string>('start', job),
    next: (id) => call<JobEvent | null>('next', id),
    cancel: (id) => call<void>('cancel', id),
    dispose() {
      win.removeEventListener('message', onMessage);
      for (const waiting of pending.values()) waiting.reject(new Error('The export was closed.'));
      pending.clear();
      frame.remove();
    },
  };
  return started.then(() => engine);
}
