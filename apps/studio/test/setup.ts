// Source: DataViz packages/web/test/setup.ts @ efcdbe2 (TashiikiD/DataViz, private), adapted for Loopweft.
import { notifications } from '@mantine/notifications';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// What Mantine needs from a browser that jsdom does not provide.
window.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }) as MediaQueryList;

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

Element.prototype.scrollIntoView ??= () => undefined;

// Mantine's autosizing Textarea resizes again when fonts finish loading.
if (!('fonts' in document)) {
  Object.defineProperty(document, 'fonts', {
    value: {
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      ready: Promise.resolve(),
    },
  });
}

const { getComputedStyle } = window;
window.getComputedStyle = (element: Element) => getComputedStyle(element);

afterEach(() => {
  cleanup();
  // The notification store is global: without this, earlier tests' toasts fill the visible limit.
  notifications.clean();
  notifications.cleanQueue();
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
