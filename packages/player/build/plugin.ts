// A Vite plugin for the Studio: `import template from 'virtual:loopweft-player-template'` gives the player's
// one-file page (template.ts), so the Studio's Export makes the same file as `loopweft export --html`. The
// Studio imports it only when it exports, so the page (about 1.2 MB) loads only then.
import type { Plugin } from 'vite';
import { buildPlayerTemplate } from './template.ts';

export const TEMPLATE_MODULE = 'virtual:loopweft-player-template';
const RESOLVED = `\0${TEMPLATE_MODULE}`;

export function playerTemplatePlugin(): Plugin {
  return {
    name: 'loopweft-player-template',
    resolveId(id) {
      return id === TEMPLATE_MODULE ? RESOLVED : null;
    },
    async load(id) {
      if (id !== RESOLVED) return null;
      return `export default ${JSON.stringify(await buildPlayerTemplate())};`;
    },
  };
}
