// Source: DataViz packages/normalize/src/xlsx.ts @ efcdbe2 (TashiikiD/DataViz, private), copied for Loopweft
// with .ts import specifiers.
import readXlsxFile from 'read-excel-file/universal';
import type { SourceFile } from './readers.ts';
import { firstFilledRow, type SourceTable } from './table.ts';

/** Spreadsheet cells as text: dates as ISO (date only when there is no time), numbers as stored. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    const iso = value.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}

/**
 * Reads every sheet of an .xlsx workbook as rows of text, row `i` being the sheet's row `i + 1`. Sheets
 * without any text are listed as skipped.
 */
export async function readXlsx(
  bytes: Uint8Array,
  name: string,
): Promise<{ tables: SourceTable[]; skipped: SourceFile['skipped'] }> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  let sheets: { sheet: string; data: unknown[][] }[];
  try {
    // Numbers are kept exactly as stored in the file; normalization decides how to read them.
    sheets = await readXlsxFile(buffer, { trim: false, parseNumber: (text: string) => text });
  } catch (error) {
    throw new Error(`${name} could not be read as an .xlsx workbook (${(error as Error).message}).`);
  }
  const tables: SourceTable[] = [];
  const skipped: SourceFile['skipped'] = [];
  for (const { sheet, data } of sheets) {
    const cells = data.map((row) => row.map(cellText));
    if (firstFilledRow(cells) === 0) skipped.push({ sheet, reason: 'empty' });
    else tables.push({ kind: 'grid', name, sheet, cells });
  }
  return { tables, skipped };
}
