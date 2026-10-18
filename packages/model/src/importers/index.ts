// Reading a file to import: a DataViz project, a Kumu blueprint or spreadsheet, or plain tables (CSV, TSV,
// Excel). The format comes from the file itself unless it is given; the importers then build the project.

import { createProject } from '../project.ts';
import { ImportError, type ImportOutcome } from './build.ts';
import { importDataViz, isDataVizJson } from './dataviz.ts';
import { importKumu, isKumuJson, isKumuSheets, type KumuData, kumuFromJson, kumuFromSheets } from './kumu.ts';
import { guessShape, type Shape } from './mapping.ts';
import { decodeText, readSource, type SourceFile, type TextEncodingName } from './read/readers.ts';
import { tableLabel, tableWithHeader } from './read/table.ts';
import { importTables, type TablePlan } from './tables.ts';

export const IMPORT_FORMATS = ['tables', 'kumu', 'dataviz'] as const;
export type ImportFormat = (typeof IMPORT_FORMATS)[number];

export type ImportSource =
  | { format: 'tables'; file: SourceFile }
  | { format: 'kumu'; data: KumuData; name: string }
  | { format: 'dataviz'; data: unknown; name: string };

export interface ReadImportOptions {
  format?: ImportFormat;
  /** A text file's encoding, when detecting it is not enough. */
  encoding?: TextEncodingName;
}

const isJsonName = (name: string) => /\.json$/i.test(name);

/** Reads a file to import and works out what it is. */
export async function readImportFile(
  file: { name: string; bytes: Uint8Array },
  options: ReadImportOptions = {},
): Promise<ImportSource> {
  if (
    options.format !== 'tables' &&
    (isJsonName(file.name) || options.format === 'kumu' || options.format === 'dataviz')
  ) {
    if (
      isJsonName(file.name) ||
      options.format === 'dataviz' ||
      (options.format === 'kumu' && !/\.(xlsx|csv|tsv|txt)$/i.test(file.name))
    ) {
      const { text } = decodeText(file.bytes, file.name, options.encoding);
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch (error) {
        throw new Error(`${file.name} is not valid JSON (${(error as Error).message}).`);
      }
      if (options.format === 'dataviz' || (options.format !== 'kumu' && isDataVizJson(data))) {
        return { format: 'dataviz', data, name: file.name };
      }
      if (options.format === 'kumu' || isKumuJson(data))
        return { format: 'kumu', data: kumuFromJson(data), name: file.name };
      throw new Error(
        `${file.name} is neither a Kumu blueprint (elements and connections) nor a DataViz project (format "dataviz.project").`,
      );
    }
  }
  const source = await readSource(file, options.encoding ? { encoding: options.encoding } : {});
  if (options.format === 'kumu' || (options.format === undefined && isKumuSheets(source))) {
    return { format: 'kumu', data: kumuFromSheets(source), name: file.name };
  }
  return { format: 'tables', file: source };
}

/** Each table of a file with its header row, and the kind of rows it most likely holds. */
export function tablePlans(file: SourceFile, headerRows: Readonly<Record<string, number>> = {}): TablePlan[] {
  const empty = createProject({ title: 'plan' });
  return file.tables.map((source) => {
    const key = source.sheet ?? '';
    const table = tableWithHeader(source, headerRows[key]);
    return { table, shape: guessShape(table, empty) as Shape };
  });
}

/** The file's name without its folder and extensions, as a title when nothing else gives one. */
export const titleFromName = (name: string): string =>
  (name.split(/[\\/]/).pop() ?? name)
    .replace(/(\.dataviz)?\.[^.]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();

/** Builds the project from a read file: tables with the plans given (or guessed), Kumu, or DataViz. */
export function importSource(
  source: ImportSource,
  options: { title?: string; plans?: TablePlan[]; signField?: string } = {},
): ImportOutcome {
  switch (source.format) {
    case 'dataviz':
      return importDataViz(source.data, options.title ? { title: options.title } : {});
    case 'kumu':
      return importKumu(source.data, {
        // Kumu's export names its project; a blueprint or a spreadsheet does not.
        title: options.title ?? (source.data.name || titleFromName(source.name)),
        ...(options.signField ? { signField: options.signField } : {}),
      });
    case 'tables': {
      const plans = options.plans ?? tablePlans(source.file);
      if (!plans.some((p) => p.shape === 'links') && !plans.some((p) => p.shape === 'variables')) {
        throw new ImportError([{ where: source.file.name, message: 'The file holds no table to import.' }]);
      }
      const outcome = importTables(plans, { title: options.title ?? titleFromName(source.file.name) });
      const read = plans.map((p) => `${tableLabel(p.table)} as ${p.shape}`);
      const notes = [...outcome.notes, `Read ${read.join(' and ')}.`];
      if (source.file.encoding?.by === 'fallback') {
        notes.push(
          `${source.file.name} is not UTF-8 text, so it was read as Windows-1252; check its accented letters.`,
        );
      }
      for (const skipped of source.file.skipped)
        notes.push(`Skipped the sheet "${skipped.sheet}": ${skipped.reason}.`);
      return { project: outcome.project, notes };
    }
  }
}

export { ImportError, type ImportOutcome, type ImportProblem } from './build.ts';
export { importDataViz, isDataVizJson } from './dataviz.ts';
export { importKumu, isKumuJson, type KumuData, kumuFromJson, kumuHasValue } from './kumu.ts';
export {
  type ColumnMapping,
  type ColumnTarget,
  guessShape,
  inferFieldKind,
  LINK_KEYS,
  mappingProblems,
  type Shape,
  suggestMapping,
  VARIABLE_KEYS,
} from './mapping.ts';
export {
  decodeText,
  readSource,
  type SourceFile,
  TEXT_ENCODINGS,
  type TextEncodingName,
} from './read/readers.ts';
export { MAX_IMPORT_BYTES, type TableData, tableLabel, tableWithHeader } from './read/table.ts';
export { importTables, planMappings, type TablePlan } from './tables.ts';
