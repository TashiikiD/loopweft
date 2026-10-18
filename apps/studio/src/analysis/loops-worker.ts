// The worker behind searchLoops: one search per worker, answered once.
import { type LoopRequest, runLoopSearch } from './loop-search.ts';

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<LoopRequest>) => void) | null;
  postMessage(message: unknown): void;
};

scope.onmessage = (event) => scope.postMessage(runLoopSearch(event.data));
