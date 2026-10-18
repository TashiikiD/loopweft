// Source: DataViz packages/web/src/data/grid-model.ts @ efcdbe2 (TashiikiD/DataViz, private), adapted for
// Loopweft: parseClipboard and toClipboard as they are; planPaste for the table's columns, which have no
// automatic ones (only the id cannot be written).
import { normalizeToken } from '@loopweft/model';
import type { CellEdit, TableColumn } from './model.ts';

/** Spreadsheet text (tab-separated rows, quoted cells) as rows of cells. */
export function parseClipboard(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let atCellStart = true;
  const input = text.replace(/\r\n?/g, '\n');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i] as string;
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"' && atCellStart) {
      quoted = true;
      atCellStart = false;
      continue;
    }
    if (ch === '\t') {
      row.push(cell);
      cell = '';
      atCellStart = true;
      continue;
    }
    if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      atCellStart = true;
      continue;
    }
    cell += ch;
    atCellStart = false;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** A range as spreadsheets paste it: tabs between cells, line breaks between rows, quotes where needed. */
export function toClipboard(cells: readonly (readonly string[])[]): string {
  const quote = (text: string) => (/[\t\n\r"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
  return cells.map((row) => row.map(quote).join('\t')).join('\n');
}

export interface PastePlan {
  edits: CellEdit[];
  /** The first pasted row named the columns, so it was skipped. */
  skippedHeader: boolean;
  /** Pasted columns beyond the last column of the table, left out. */
  ignoredColumns: number;
  /** Rows the paste adds after the last row. */
  addedRows: number;
  /** Cells pasted onto a column that cannot be written (the id), left as they were. */
  skippedCells: number;
}

/**
 * Turns a pasted range into cell edits, starting at a cell of the table (`row` among the rows shown,
 * `column` among the columns). `rows` gives the place in its list of each row shown. Rows past the last
 * one shown are added at the end; columns past the last column are left out. A first row that names the
 * target columns is a header and is skipped.
 */
export function planPaste(
  range: readonly (readonly string[])[],
  start: { row: number; column: number },
  shown: { rows: readonly number[]; columns: readonly TableColumn[]; totalRows: number },
): PastePlan {
  const width = Math.max(0, ...range.map((r) => r.length));
  const targets = shown.columns.slice(start.column, start.column + width);
  const ignoredColumns = Math.max(0, width - targets.length);
  const first = range[0] ?? [];
  const isHeader =
    range.length > 1 &&
    targets.length > 0 &&
    targets.every((column, i) => {
      const text = normalizeToken(first[i] ?? '');
      return text !== '' && (text === normalizeToken(column.name) || text === normalizeToken(column.key));
    });
  const body = isHeader ? range.slice(1) : range;
  const edits: CellEdit[] = [];
  let next = shown.totalRows;
  let skippedCells = 0;
  body.forEach((cells, offset) => {
    const target = shown.rows[start.row + offset];
    const index = target ?? next++;
    targets.forEach((column, i) => {
      if (column.editor === 'none') {
        skippedCells++;
        return;
      }
      edits.push({ row: index, column: column.key, text: cells[i] ?? '' });
    });
  });
  return { edits, skippedHeader: isHeader, ignoredColumns, addedRows: next - shown.totalRows, skippedCells };
}
