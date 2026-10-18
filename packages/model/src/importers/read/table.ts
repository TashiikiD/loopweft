// Source: DataViz packages/normalize/src/table.ts @ efcdbe2 (TashiikiD/DataViz, private), copied for Loopweft
// unchanged except the limit's comment.
/** Largest file (or pasted text) Loopweft imports. */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

/** A table read from a file, before mapping: header names and rows of raw text. */
export interface TableData {
  /** Original file name. */
  name: string;
  /** Sheet name for spreadsheets; the key for JSON objects holding several tables. */
  sheet?: string;
  /** The columns to map: those with a header or a value. */
  columns: string[];
  /** The rows under the header holding a value, one string per column; missing cells are empty strings. */
  rows: string[][];
  /** The source row holding the column names (1 = first); 0 when it has none. Absent for JSON. */
  headerRow?: number;
  /** The rows above the header row (titles, notes), as read, blank ones included. */
  skipped?: string[][];
  /**
   * The table as read, kept as the raw copy: a name for every column (blank ones included), the header
   * cells as read when they differ from those names, and every row under the header as read (blank ones
   * included). Absent for a table built by hand, whose `columns` and `rows` are the original.
   */
  layout?: TableLayout;
}

/** A table's columns and rows in the original's layout. */
export interface TableLayout {
  columns: string[];
  header?: string[];
  rows: string[][];
}

/**
 * A table as read from a file, before its header row is chosen: a grid of rows (CSV, TSV, a sheet; row
 * `i` is the file's row `i + 1`, blank rows included) or records whose keys are the columns (JSON).
 */
export type SourceTable =
  | { kind: 'grid'; name: string; sheet?: string; cells: string[][] }
  | { kind: 'records'; name: string; sheet?: string; columns: string[]; rows: string[][] };

/** `file.csv` or `book.xlsx (Links)`, for messages. */
export const tableLabel = (table: { name: string; sheet?: string }): string =>
  table.sheet === undefined ? table.name : `${table.name} (${table.sheet})`;

const isBlank = (row: readonly string[]) => row.every((cell) => cell.trim() === '');

/**
 * Makes headers usable as keys: trims, names blank headers `Column N` and suffixes duplicates
 * (`Name`, `Name (2)`), so every column stays addressable and none is silently dropped.
 */
export function cleanHeaders(headers: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((raw, i) => {
    const base = raw.trim() || `Column ${i + 1}`;
    const count = (seen.get(base.toLowerCase()) ?? 0) + 1;
    seen.set(base.toLowerCase(), count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

/**
 * Builds a table from a header row and data rows. Short rows are padded; fields beyond the header get
 * columns of their own (`Column N`, by position), so no source value is dropped. Blank rows, and columns
 * with neither a header nor a value, hold nothing to map and are left out of `columns` and `rows`; the
 * `layout` keeps them, as read.
 */
export function tableFrom(
  name: string,
  header: readonly string[],
  body: readonly (readonly string[])[],
  sheet?: string,
): TableData {
  // Every source field, trailing blank ones too (the layout keeps them; `filled` decides what is mapped).
  // A loop, not Math.max(...rows): spreading one argument per row overflows the stack on large tables.
  let width = header.length;
  for (const row of body) width = Math.max(width, row.length);
  const names = cleanHeaders([...header, ...Array<string>(Math.max(0, width - header.length)).fill('')]);
  const filled = names.map((_, i) => (header[i] ?? '').trim() !== '');
  for (const row of body) {
    for (let i = 0; i < width; i++) if (!filled[i] && (row[i] ?? '').trim() !== '') filled[i] = true;
  }
  const keep = names.flatMap((_, i) => (filled[i] ? [i] : []));
  const rows = body.filter((row) => !isBlank(row)).map((row) => keep.map((i) => row[i] ?? ''));
  const named = header.length === names.length && header.every((cell, i) => cell === names[i]);
  return {
    name,
    ...(sheet === undefined ? {} : { sheet }),
    columns: keep.map((i) => names[i] as string),
    rows,
    layout: {
      columns: names,
      ...(header.length === 0 || named ? {} : { header: [...header] }),
      rows: body.map((row) => [...row]),
    },
  };
}

/** The first row holding any text (1-based), or 0 when every row is blank. */
export function firstFilledRow(cells: readonly (readonly string[])[]): number {
  return cells.findIndex((row) => !isBlank(row)) + 1;
}

/**
 * The table a source gives with its header in `headerRow` (1-based; default: the first non-blank row).
 * `0` means the source has no header row, so its columns are named `Column 1`, `Column 2`, …. The rows
 * above the header are kept as `skipped`. JSON records have their keys as columns and no header row.
 */
export function tableWithHeader(source: SourceTable, headerRow?: number): TableData {
  const label = tableLabel(source);
  if (source.kind === 'records') {
    if (headerRow !== undefined) throw new Error(`${label}: JSON tables have no header row to choose.`);
    return tableFrom(source.name, source.columns, source.rows, source.sheet);
  }
  const { cells } = source;
  const at = headerRow ?? firstFilledRow(cells);
  if (!Number.isInteger(at) || at < 0) throw new Error(`${label}: the header row must be a row number.`);
  if (at > cells.length) {
    throw new Error(`${label}: there is no row ${at} (the table has ${cells.length} rows).`);
  }
  if (at > 0 && isBlank(cells[at - 1] as string[])) {
    throw new Error(`${label}: row ${at} is empty, so it cannot hold the column names.`);
  }
  const table = tableFrom(
    source.name,
    at > 0 ? (cells[at - 1] as string[]) : [],
    cells.slice(at),
    source.sheet,
  );
  const skipped = cells.slice(0, Math.max(0, at - 1));
  return { ...table, headerRow: at, ...(skipped.length ? { skipped: skipped.map((row) => [...row]) } : {}) };
}
