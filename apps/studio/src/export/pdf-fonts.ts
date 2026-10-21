// The PDFs' font files for the Studio: each file the PDFs may use (packages/export/src/pdf/fonts.ts) is built
// into a small module of its own holding it, loaded only when a PDF needs it, as the player's page is for the
// one-file HTML. Nothing is fetched from anywhere else.
import type { FontReader } from '@loopweft/export';

/** Each font file's module, by its path inside node_modules (only the weights and styles the PDFs use). */
const MODULES = import.meta.glob(
  [
    '../../../../node_modules/@fontsource/inter/files/inter-*-400-normal.woff',
    '../../../../node_modules/@fontsource/inter/files/inter-*-600-normal.woff',
    '../../../../node_modules/@fontsource/inter/files/inter-*-400-italic.woff',
    '../../../../node_modules/@fontsource/fraunces/files/fraunces-*-400-normal.woff',
    '../../../../node_modules/@fontsource/fraunces/files/fraunces-*-600-normal.woff',
    '../../../../node_modules/@fontsource/fraunces/files/fraunces-*-400-italic.woff',
    '../../../../node_modules/@fontsource/noto-sans-math/files/noto-sans-math-latin-400-normal.woff',
  ],
  { query: '?inline', import: 'default' },
) as Record<string, () => Promise<string>>;

/** The font files the Studio has, by their path inside @fontsource. */
export const STUDIO_FONT_FILES: ReadonlyMap<string, () => Promise<string>> = new Map(
  Object.entries(MODULES).map(([path, load]) => [
    path.slice(path.indexOf('@fontsource/') + '@fontsource/'.length),
    load,
  ]),
);

/** A data address's bytes. */
function decodeDataUrl(url: string): Uint8Array {
  const base64 = url.slice(url.indexOf(',') + 1);
  const text = atob(base64);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}

const cache = new Map<string, Promise<Uint8Array>>();

/** Loads a font file of the Studio's (each once). */
export const studioFonts: FontReader = (file) => {
  const known = cache.get(file);
  if (known) return known;
  const load = STUDIO_FONT_FILES.get(file);
  if (!load) return Promise.reject(new Error(`The Studio has no font file ${file}.`));
  const loading = load().then(decodeDataUrl);
  cache.set(file, loading);
  loading.catch(() => cache.delete(file));
  return loading;
};
