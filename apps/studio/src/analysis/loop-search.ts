// Finding a map's feedback loops, off the page's thread: a map with many loops takes seconds to count, and
// the Studio stays usable meanwhile (a search can be stopped). Where there are no workers (the tests), the
// search runs on the page. The result depends only on the map and the options: no time limit is read.
import { type FoundLoop, findLoops, type LoopStats, loopStats, type Project } from '@loopweft/model';

export interface LoopRequest {
  project: Project;
  /** Only loops of at most this many links. */
  maxLength?: number;
  includeOptional: boolean;
  /** How many loops to list (all are counted, up to the model's limit). */
  listLimit: number;
}

export interface LoopAnswer {
  /** The loops listed, at most `listLimit`. */
  loops: FoundLoop[];
  /** The count of every loop (a lower bound when `capped`). */
  total: LoopStats;
}

/** Lists up to `listLimit` loops, and counts them all when there are more. */
export function runLoopSearch(request: LoopRequest): LoopAnswer {
  const options = {
    includeOptional: request.includeOptional,
    ...(request.maxLength !== undefined ? { maxLength: request.maxLength } : {}),
  };
  const { loops, stats } = findLoops(request.project, { ...options, limit: request.listLimit });
  return { loops, total: stats.capped ? loopStats(request.project, options) : stats };
}

export interface LoopSearch {
  /** The answer, or null when the search was stopped. */
  result: Promise<LoopAnswer | null>;
  stop(): void;
}

/** Starts a search in a worker (or on the page where there are none). */
export function searchLoops(request: LoopRequest): LoopSearch {
  if (typeof Worker === 'undefined') {
    let stopped = false;
    return {
      result: Promise.resolve().then(() => (stopped ? null : runLoopSearch(request))),
      stop: () => {
        stopped = true;
      },
    };
  }
  const worker = new Worker(new URL('./loops-worker.ts', import.meta.url), { type: 'module' });
  let settle: (answer: LoopAnswer | null) => void = () => {};
  let fail: (error: Error) => void = () => {};
  const result = new Promise<LoopAnswer | null>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  worker.onmessage = (event: MessageEvent<LoopAnswer>) => {
    worker.terminate();
    settle(event.data);
  };
  worker.onerror = (event) => {
    worker.terminate();
    fail(new Error(event.message || 'The loop search failed.'));
  };
  worker.postMessage(request);
  return {
    result,
    stop: () => {
      worker.terminate();
      settle(null);
    },
  };
}
