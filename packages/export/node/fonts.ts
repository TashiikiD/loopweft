// Loopweft's PDF fonts, read from the @fontsource packages installed with it.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { FontReader } from '../src/pdf/fonts.ts';

/** Reads a font file by its path inside @fontsource, e.g. "inter/files/inter-latin-400-normal.woff". */
export const nodeFonts: FontReader = async (file) =>
  new Uint8Array(await readFile(fileURLToPath(import.meta.resolve(`@fontsource/${file}`))));
