// Source: DataViz packages/normalize/src/readers.ts @ efcdbe2 (TashiikiD/DataViz, private), copied for
// Loopweft with .ts import specifiers; a DataViz project is pointed to its own importer, and no raw copy of
// a file is kept, so the size limit says nothing of one.
import Papa from 'papaparse';
import { MAX_IMPORT_BYTES, type SourceTable, type TableData, tableWithHeader } from './table.ts';

export const TABLE_FORMATS = ['csv', 'tsv', 'json', 'xlsx'] as const;
export type TableFormat = (typeof TABLE_FORMATS)[number];

/** Text encodings a CSV, TSV or JSON file may be read with. */
export const TEXT_ENCODINGS = ['utf-8', 'windows-1252', 'utf-16le', 'utf-16be'] as const;
export type TextEncodingName = (typeof TEXT_ENCODINGS)[number];

export interface TextEncodingUsed {
  name: TextEncodingName;
  /** `bom`: the file starts with a byte-order mark; `valid`: it is valid UTF-8; `fallback`: it is not, so
   * it was read as Windows-1252; `chosen`: the caller named the encoding. */
  by: 'bom' | 'valid' | 'fallback' | 'chosen';
}

/** A file read into tables, before header rows and mappings are chosen. */
export interface SourceFile {
  name: string;
  format: TableFormat;
  /** Text formats: the encoding the file was read with. */
  encoding?: TextEncodingUsed;
  tables: SourceTable[];
  /** Parts holding no table: empty sheets, JSON keys whose values are not arrays of objects. */
  skipped: { sheet: string; reason: string }[];
}

export interface ReadOptions {
  /** Overrides the format the file name's extension gives (needed for text without one). */
  format?: TableFormat;
  /** Overrides encoding detection for text formats. */
  encoding?: TextEncodingName;
}

const BOMS: { name: TextEncodingName; bytes: number[] }[] = [
  { name: 'utf-8', bytes: [0xef, 0xbb, 0xbf] },
  { name: 'utf-16le', bytes: [0xff, 0xfe] },
  { name: 'utf-16be', bytes: [0xfe, 0xff] },
];

/** Size in MB, rounded up to a tenth, so a file just over the limit never reads as the limit. */
const megabytes = (bytes: number) => `${Math.ceil((bytes / (1024 * 1024)) * 10) / 10} MB`;

/**
 * Decodes text without ever replacing characters: a byte-order mark decides; else valid UTF-8 is read as
 * UTF-8 and anything else as Windows-1252 (which every byte sequence is), and the result says which.
 * A named encoding is used as given and must decode cleanly.
 */
export function decodeText(
  bytes: Uint8Array,
  name: string,
  encoding?: TextEncodingName,
): { text: string; encoding: TextEncodingUsed } {
  const decode = (label: TextEncodingName) => new TextDecoder(label, { fatal: true }).decode(bytes);
  if (encoding) {
    try {
      return { text: decode(encoding), encoding: { name: encoding, by: 'chosen' } };
    } catch {
      throw new Error(`${name} is not valid ${encoding.toUpperCase()} text; choose another encoding.`);
    }
  }
  const bom = BOMS.find((b) => b.bytes.every((byte, i) => bytes[i] === byte));
  if (bom) {
    try {
      return { text: decode(bom.name), encoding: { name: bom.name, by: 'bom' } };
    } catch {
      throw new Error(`${name} starts like ${bom.name.toUpperCase()} text but is not; choose its encoding.`);
    }
  }
  try {
    return { text: decode('utf-8'), encoding: { name: 'utf-8', by: 'valid' } };
  } catch {
    return { text: decode('windows-1252'), encoding: { name: 'windows-1252', by: 'fallback' } };
  }
}

/** The format a file is read as: the one given, else its extension, else (no extension) its content. */
export function formatOf(name: string, bytes: Uint8Array, format?: TableFormat): TableFormat {
  if (format) return format;
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  if (extension === 'csv' || extension === 'txt') return 'csv';
  if (extension === 'tsv' || extension === 'json' || extension === 'xlsx') return extension;
  if (extension) throw new Error(`${name}: unsupported file type (use .csv, .tsv, .json or .xlsx).`);
  // Text without a name, e.g. pasted: JSON when it starts like JSON.
  const first = bytes.find((byte) => byte !== 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d);
  return first === 0x5b || first === 0x7b ? 'json' : 'csv';
}

/** Parses CSV or TSV text into rows as written (row `i` is record `i + 1`, blank records kept). */
export function parseCsvSource(text: string, name: string, delimiter?: string): SourceTable {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const result = Papa.parse<string[]>(clean, { skipEmptyLines: false, ...(delimiter ? { delimiter } : {}) });
  const fatal = result.errors.find((e) => e.type === 'Quotes');
  if (fatal) throw new Error(`${name}: ${fatal.message} (row ${(fatal.row ?? 0) + 1})`);
  const cells = result.data;
  // A final line break gives one empty record; it is not a row of the file.
  if (cells.length > 0 && (cells.at(-1) as string[]).every((cell) => cell === '')) cells.pop();
  return { kind: 'grid', name, cells };
}

/** Parses CSV/TSV text (delimiter detected, BOM removed). The first non-empty row is the header. */
export const parseCsv = (text: string, name: string): TableData =>
  tableWithHeader(parseCsvSource(text, name));

const cellText = (value: unknown): string =>
  value === null || value === undefined
    ? ''
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function recordsTable(records: Record<string, unknown>[], name: string, sheet?: string): SourceTable {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  return {
    kind: 'records',
    name,
    ...(sheet === undefined ? {} : { sheet }),
    columns,
    rows: records.map((record) => columns.map((column) => cellText(record[column]))),
  };
}

/**
 * Parses JSON holding an array of objects, or an object whose arrays of objects are tables named by
 * their keys (`{"entities": [...], "relations": [...]}`). Columns are the union of keys in first-seen
 * order; nested values are kept as JSON text. Other keys are listed as skipped, with the reason.
 */
export function parseJsonTables(
  text: string,
  name: string,
): { tables: SourceTable[]; skipped: SourceFile['skipped'] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`${name}: not valid JSON (${(error as Error).message}).`);
  }
  if (Array.isArray(data)) {
    if (!data.every(isRecord)) throw new Error(`${name}: expected an array of objects.`);
    return { tables: [recordsTable(data, name)], skipped: [] };
  }
  if (!isRecord(data)) {
    throw new Error(`${name}: expected an array of objects, or an object holding arrays of objects.`);
  }
  if (data.format === 'dataviz.project') {
    throw new Error(`${name} is a DataViz project file; import it as a DataViz project, not as tables.`);
  }
  const tables: SourceTable[] = [];
  const skipped: SourceFile['skipped'] = [];
  for (const [key, value] of Object.entries(data)) {
    if (!Array.isArray(value)) skipped.push({ sheet: key, reason: 'not an array' });
    else if (value.length === 0) skipped.push({ sheet: key, reason: 'empty' });
    else if (!value.every(isRecord)) skipped.push({ sheet: key, reason: 'not an array of objects' });
    else tables.push(recordsTable(value, name, key));
  }
  if (tables.length === 0) {
    throw new Error(`${name}: expected an array of objects, or an object holding arrays of objects.`);
  }
  return { tables, skipped };
}

/**
 * Reads a file into its tables: .csv/.tsv/.txt, .json or .xlsx (every sheet), or text in the format given.
 * Files above `MAX_IMPORT_BYTES` are refused.
 */
export async function readSource(
  file: { name: string; bytes: Uint8Array },
  options: ReadOptions = {},
): Promise<SourceFile> {
  const { name, bytes } = file;
  if (bytes.byteLength > MAX_IMPORT_BYTES) {
    throw new Error(
      `${name} is ${megabytes(bytes.byteLength)}; files up to ${megabytes(MAX_IMPORT_BYTES)} can be imported.`,
    );
  }
  const format = formatOf(name, bytes, options.format);
  if (format === 'xlsx') {
    if (options.encoding) throw new Error(`${name}: an encoding applies to text files, not spreadsheets.`);
    const { readXlsx } = await import('./xlsx.ts');
    return { name, format, ...(await readXlsx(bytes, name)) };
  }
  const { text, encoding } = decodeText(bytes, name, options.encoding);
  if (format === 'json') return { name, format, encoding, ...parseJsonTables(text, name) };
  return {
    name,
    format,
    encoding,
    tables: [parseCsvSource(text, name, format === 'tsv' ? '\t' : undefined)],
    skipped: [],
  };
}

/** Reads every table in a file with its default header row (see `readSource`). */
export async function readTables(
  file: { name: string; bytes: Uint8Array },
  options: ReadOptions = {},
): Promise<TableData[]> {
  return (await readSource(file, options)).tables.map((table) => tableWithHeader(table));
}
