// A Vite plugin for the Studio: `import page from 'virtual:loopweft-export-page'` gives the export page
// (build/page.ts), which the Studio runs in a hidden frame to draw pictures exactly as `loopweft export` does.
// The Studio imports it only when it exports, so the page loads only then.
import type { Plugin } from 'vite';
import { exportPage } from './page.ts';

export const EXPORT_PAGE_MODULE = 'virtual:loopweft-export-page';
const RESOLVED = `\0${EXPORT_PAGE_MODULE}`;

export function exportPagePlugin(): Plugin {
  return {
    name: 'loopweft-export-page',
    resolveId(id) {
      return id === EXPORT_PAGE_MODULE ? RESOLVED : null;
    },
    async load(id) {
      if (id !== RESOLVED) return null;
      return `export default ${JSON.stringify(await exportPage())};`;
    },
  };
}
