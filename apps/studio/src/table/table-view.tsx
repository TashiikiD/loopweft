// Source: DataViz packages/web/src/data/shape-grid.tsx @ efcdbe2 (TashiikiD/DataViz, private), adapted for
// Loopweft: the same grid (react-data-grid), range selection, copy, paste, clear and fill down, over the
// map's variables and links. A new row is held as a draft until it has what an element needs (a name; a
// link's two ends), since Loopweft keeps no half-made variables or links.
//
// The table view: the map's variables or links as a spreadsheet. Every change is one undoable step, made by
// @loopweft/model's operations, so typed and pasted text is read strictly; sorting and searching never
// change the map. The rows selected here are the map's selection, shown in the inspector.
import { type Issue, OpError, plural, validateProject } from '@loopweft/model';
import {
  Button,
  Group,
  SegmentedControl,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
  useComputedColorScheme,
  VisuallyHidden,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconSearch, IconTrash, IconX } from '@tabler/icons-react';
import { type ClipboardEvent, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  type CalculatedColumn,
  type Column,
  DataGrid,
  type DataGridHandle,
  SelectColumn,
  type SortColumn,
} from 'react-data-grid';
import { refused, useEdit, useStudio, useStudioStore } from '../context.tsx';
import { removalImpact, removalQuestion, removeSelection } from '../map/edit.ts';
import { StudioEnvContext } from '../providers.tsx';
import { isTextEntry } from '../text-entry.ts';
import { parseClipboard, planPaste, toClipboard } from './clipboard.ts';
import { MultilineEditor, SuggestEditor, TextEditor } from './editors.tsx';
import {
  applyCells,
  type CellEdit,
  cellText,
  cellValue,
  type Element,
  elementsOf,
  type Shape,
  type TableColumn,
  tableColumns,
  visibleRows,
} from './model.ts';

/** A row of the table: an element and its place in its list, or (element null) the row to add one. */
interface GridRow {
  index: number;
  element: Element | null;
}

/** A cell: row among the rows shown, column among the table's columns. */
interface Position {
  row: number;
  col: number;
}

/** Columns before the table's own: row selection and the row number. */
const LEADING = 2;

const NOUN: Record<Shape, [string, string]> = {
  variables: ['variable', 'variables'],
  links: ['link', 'links'],
};
const count = (n: number, shape: Shape) => plural(n, NOUN[shape][0], NOUN[shape][1]);

/** The checks' findings by cell (`3:sign`), or by row (`3:#`). Citations are for the Sources workspace. */
function cellIssues(issues: readonly Issue[], shape: Shape, columns: readonly TableColumn[]) {
  const keys = new Set(columns.map((c) => c.key));
  const cells = new Map<string, Issue[]>();
  for (const issue of issues) {
    const [area, index, key, sub] = issue.path;
    if (area !== shape || typeof index !== 'number' || key === 'citations') continue;
    const column = key === 'fields' && typeof sub === 'string' ? `field:${sub}` : key;
    const id = `${index}:${typeof column === 'string' && keys.has(column) ? column : '#'}`;
    cells.set(id, [...(cells.get(id) ?? []), issue]);
  }
  return cells;
}

/** Says why cells were not changed: every problem, up to a handful. */
function refusedCells(error: unknown) {
  if (!(error instanceof OpError) || error.issues.length < 2) {
    refused(error, 'Nothing was changed');
    return;
  }
  const shown = error.issues.slice(0, 6);
  notifications.show({
    color: 'red',
    title: 'Nothing was changed',
    autoClose: 12000,
    message: (
      <ul className="lw-problems">
        {shown.map((issue) => (
          <li key={`${issue.path.join('.')}:${issue.message}`}>{issue.message}</li>
        ))}
        {error.issues.length > shown.length && <li>…and {error.issues.length - shown.length} more.</li>}
      </ul>
    ),
  });
}

/** What an empty new row shows in a cell, as a hint. */
function placeholder(shape: Shape, key: string): string | null {
  if (shape === 'variables') return key === 'label' ? 'New variable: its name' : null;
  if (key === 'from') return 'New link: cause';
  if (key === 'to') return 'effect';
  if (key === 'sign') return '?';
  return null;
}

/** One kind of element as an editable grid. */
function ShapeTable({ shape, search }: { shape: Shape; search: string }) {
  // In tests nothing has a size, so every row is drawn. react-data-grid (7.0.0-beta.61) then draws frozen
  // columns twice, so they are frozen only when it virtualizes.
  const virtualize = useContext(StudioEnvContext) !== 'test';
  const scheme = useComputedColorScheme('light');
  const store = useStudioStore();
  const project = useStudio((s) => s.project);
  const selection = useStudio((s) => s.selection);
  const grid = useRef<DataGridHandle>(null);
  const [sort, setSort] = useState<readonly SortColumn[]>([]);
  const [range, setRange] = useState<{ anchor: Position; active: Position } | null>(null);
  const extend = useRef(false);
  // The new row's cells, until it has what an element needs.
  const [draft, setDraftState] = useState<Record<string, string>>({});
  const draftRef = useRef(draft);
  const setDraft = (next: Record<string, string>) => {
    draftRef.current = next;
    setDraftState(next);
  };
  const [reveal, setReveal] = useState<{ id: string; col: number } | null>(null);

  const columns = useMemo(() => tableColumns(project, shape), [project, shape]);
  const elements = elementsOf(project, shape);
  const sortBy = sort[0];
  const order = useMemo(
    () =>
      visibleRows(project, shape, columns, {
        search,
        sort: sortBy && { key: sortBy.columnKey, direction: sortBy.direction },
      }),
    [project, shape, columns, search, sortBy],
  );
  // The grid closes an open editor when its row object changes, so a row stays the same object while its
  // element and place do: an edit elsewhere must not close the cell being typed in.
  const cache = useRef(new WeakMap<Element, GridRow>());
  const rows = useMemo(
    () =>
      order.map((index) => {
        const element = elements[index] as Element;
        const known = cache.current.get(element);
        if (known?.index === index) return known;
        const row = { index, element };
        cache.current.set(element, row);
        return row;
      }),
    [order, elements],
  );
  const filtered = search.trim() !== '';
  // A last row to type a new element into; not offered while a search hides rows.
  const phantom = useMemo<GridRow>(() => ({ index: elements.length, element: null }), [elements.length]);
  const gridRows = useMemo(() => (filtered ? rows : [...rows, phantom]), [filtered, rows, phantom]);
  const issues = useMemo(
    () => cellIssues(validateProject(project), shape, columns),
    [project, shape, columns],
  );
  const selectedIds = shape === 'variables' ? selection.variables : selection.links;
  const selectedRows = useMemo(() => new Set<string>(selectedIds), [selectedIds]);

  // A row added while the table is sorted moves to its place: the active cell follows it.
  useEffect(() => {
    if (!reveal) return;
    setReveal(null);
    const rowIdx = gridRows.findIndex((r) => r.element?.id === reveal.id);
    if (rowIdx < 0) return;
    const position = { idx: LEADING + reveal.col, rowIdx };
    grid.current?.scrollToCell(position);
    grid.current?.setActivePosition(position, { shouldFocus: true });
  }, [reveal, gridRows]);

  // --- changes ---------------------------------------------------------------------------------------------

  /** Applies cells as one undoable step; a refusal changes nothing and says why. */
  const run = (edits: CellEdit[], label: string) => {
    if (!edits.length) return null;
    try {
      return store.getState().edit((p) => applyCells(p, shape, edits), label);
    } catch (error) {
      if (!(error instanceof OpError)) console.error(error);
      refusedCells(error);
      return null;
    }
  };

  /** Tells what an edit made besides what was typed (a new category, a variable a link named). */
  const sayMade = (out: { summary: string; result: { made: string[] } } | null) => {
    if (out?.result.made.length) notifications.show({ message: out.summary, autoClose: 6000 });
  };

  /** A new row's cell: kept in the draft until the row can be added, then added as one step. */
  const commitNew = (column: TableColumn, text: string) => {
    const next = { ...draftRef.current, [column.key]: text };
    const has = (key: string) => Boolean(next[key]?.trim());
    const ready = shape === 'variables' ? has('label') : has('from') && has('to');
    if (!ready) {
      setDraft(next);
      return;
    }
    // The place past the end now, not when the table last drew: nothing else may be overwritten.
    const at = elementsOf(store.getState().project, shape).length;
    const out = run(
      Object.entries(next).map(([key, value]) => ({ row: at, column: key, text: value })),
      shape === 'variables' ? 'Add a variable' : 'Add a link',
    );
    if (!out) {
      setDraft(next);
      return;
    }
    setDraft({});
    sayMade(out);
    const id = out.result.added[0];
    if (id && sortBy) setReveal({ id, col: columns.findIndex((c) => c.key === column.key) });
  };

  const commit = (row: GridRow, column: TableColumn, text: string) => {
    if (!row.element) {
      commitNew(column, text);
      return;
    }
    sayMade(run([{ row: row.index, column: column.key, text }], `Edit ${column.name}`));
  };

  /** The cells of the range: rows (not the new one) and columns, in the order shown. */
  const rangeCells = () => {
    if (!range) return { rows: [] as GridRow[], columns: [] as TableColumn[] };
    const [r0, r1] = [range.anchor.row, range.active.row].sort((a, b) => a - b) as [number, number];
    const [c0, c1] = [range.anchor.col, range.active.col].sort((a, b) => a - b) as [number, number];
    return {
      rows: gridRows.slice(r0, r1 + 1).filter((r) => r.element !== null),
      columns: columns.slice(c0, c1 + 1),
    };
  };

  const clearRange = () => {
    const { rows: targets, columns: cols } = rangeCells();
    const edits = targets.flatMap((row) =>
      cols
        .filter((c) => c.editor !== 'none')
        .flatMap((c) =>
          cellValue(project, shape, row.element as Element, c.key)
            ? [{ row: row.index, column: c.key, text: '' }]
            : [],
        ),
    );
    run(edits, `Clear ${plural(edits.length, 'cell')}`);
  };

  /** Ctrl+D: the top row of the range into the rows below it; one row: the row above into it. */
  const fillDown = () => {
    if (!range) return;
    const { rows: targets, columns: cols } = rangeCells();
    const top = Math.min(range.anchor.row, range.active.row);
    const source = targets.length > 1 ? targets[0] : gridRows[top - 1];
    const into = targets.length > 1 ? targets.slice(1) : targets;
    if (!source?.element) return;
    const from = source.element;
    const edits = into.flatMap((row) =>
      cols
        .filter((c) => c.editor !== 'none')
        .map((c) => ({ row: row.index, column: c.key, text: cellValue(project, shape, from, c.key) })),
    );
    sayMade(run(edits, 'Fill down'));
  };

  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (isTextEntry(event.target)) return;
    const text = event.clipboardData.getData('text/plain');
    if (!text) return;
    event.preventDefault();
    const start = range?.active ?? { row: 0, col: 0 };
    const plan = planPaste(
      parseClipboard(text),
      { row: start.row, column: start.col },
      {
        rows: gridRows.filter((r) => r.element !== null).map((r) => r.index),
        columns,
        totalRows: elements.length,
      },
    );
    if (!plan.edits.length) return;
    const pasted = new Set(plan.edits.map((e) => e.row)).size;
    const out = run(plan.edits, `Paste ${plural(pasted, 'row')}`);
    if (!out) return;
    const notes = [
      plan.skippedHeader ? 'the first line named the columns, so it was not pasted' : '',
      plan.ignoredColumns
        ? `${plural(plan.ignoredColumns, 'column')} past the last column ${plan.ignoredColumns === 1 ? 'was' : 'were'} left out`
        : '',
      plan.skippedCells ? `ids stay as they are (${plural(plan.skippedCells, 'cell')} left out)` : '',
    ].filter(Boolean);
    notifications.show({
      title: `Pasted ${plural(pasted, 'row')}`,
      message: `${out.summary}${notes.length ? ` Note: ${notes.join('; ')}.` : ''} Ctrl+Z takes it back.`,
      autoClose: 8000,
    });
  };

  const onCopy = (event: ClipboardEvent<HTMLDivElement>) => {
    if (isTextEntry(event.target) || !range) return;
    const { rows: targets, columns: cols } = rangeCells();
    if (!targets.length || !cols.length) return;
    event.clipboardData.setData(
      'text/plain',
      toClipboard(
        targets.map((row) => cols.map((c) => cellValue(project, shape, row.element as Element, c.key))),
      ),
    );
    event.preventDefault();
  };

  const select = (ids: string[]) =>
    store
      .getState()
      .select(
        shape === 'variables'
          ? { variables: ids, links: [], loop: null }
          : { variables: [], links: ids, loop: null },
      );

  // --- columns -----------------------------------------------------------------------------------------------

  const inRange = (rowIdx: number, col: number) =>
    range !== null &&
    (range.anchor.row !== range.active.row || range.anchor.col !== range.active.col) &&
    rowIdx >= Math.min(range.anchor.row, range.active.row) &&
    rowIdx <= Math.max(range.anchor.row, range.active.row) &&
    col >= Math.min(range.anchor.col, range.active.col) &&
    col <= Math.max(range.anchor.col, range.active.col);
  const displayIndex = new Map(gridRows.map((row, i) => [row, i]));

  const editorFor = (row: GridRow, column: TableColumn) => {
    const props = {
      initial: row.element ? cellValue(project, shape, row.element, column.key) : (draft[column.key] ?? ''),
      label: `Edit ${column.name}`,
      onCommit: (text: string) => commit(row, column, text),
    };
    if (column.editor === 'lines') return <MultilineEditor {...props} />;
    if (column.editor === 'choice') return <SuggestEditor {...props} options={column.choices ?? []} />;
    return <TextEditor {...props} />;
  };

  const rdgColumns: Column<GridRow>[] = [
    { ...SelectColumn, frozen: virtualize },
    {
      key: '#',
      name: '#',
      frozen: virtualize,
      width: 64,
      renderHeaderCell: () => <VisuallyHidden>Row</VisuallyHidden>,
      renderCell: ({ row }) => {
        if (!row.element) {
          return Object.values(draft).some((t) => t.trim()) ? (
            <Tooltip label="Clear the new row">
              <UnstyledButton
                className="lw-cell-button"
                aria-label="Clear the new row"
                onClick={() => setDraft({})}
              >
                <IconX size={14} aria-hidden />
              </UnstyledButton>
            </Tooltip>
          ) : (
            <Text span size="xs" c="dimmed" aria-label={`New row: type here to add a ${NOUN[shape][0]}`}>
              +
            </Text>
          );
        }
        const found = issues.get(`${row.index}:#`);
        return (
          <Group gap={4} wrap="nowrap">
            <Text span size="xs" c="dimmed">
              {row.index + 1}
            </Text>
            {found && (
              <Tooltip label={found.map((i) => i.message).join(' ')} multiline maw={360}>
                <IconAlertTriangle size={14} className="lw-cell-flag" aria-label={found[0]?.message} />
              </Tooltip>
            )}
          </Group>
        );
      },
    },
    ...columns.map(
      (column, col): Column<GridRow> => ({
        key: column.key,
        name: column.name,
        width: column.width,
        minWidth: 60,
        resizable: true,
        sortable: true,
        editable: (row) => column.editor !== 'none' && !(row.element === null && column.key === 'id'),
        cellClass: (row) => {
          const found = row.element ? issues.get(`${row.index}:${column.key}`) : undefined;
          return [
            'lw-cell',
            inRange(displayIndex.get(row) ?? -1, col) && 'lw-cell-range',
            column.editor === 'none' && 'lw-cell-readonly',
            column.numeric && 'lw-cell-number',
            found && (found.some((i) => i.severity === 'error') ? 'lw-cell-error' : 'lw-cell-warning'),
          ]
            .filter(Boolean)
            .join(' ');
        },
        renderCell: ({ row }) => {
          if (!row.element) {
            const text = draft[column.key];
            if (text) return <span className="lw-cell-draft">{text.replace(/\s*\n\s*/g, ' ')}</span>;
            const hint = placeholder(shape, column.key);
            return hint ? <span className="lw-cell-hint">{hint}</span> : null;
          }
          const found = issues.get(`${row.index}:${column.key}`);
          const text = cellText(project, shape, row.element, column.key);
          return found ? <span title={found.map((i) => i.message).join(' ')}>{text}</span> : text;
        },
        ...(column.editor === 'none' ? {} : { renderEditCell: ({ row }) => editorFor(row, column) }),
      }),
    ),
  ];

  const dataColumn = (column: CalculatedColumn<GridRow> | undefined) =>
    column ? columns.findIndex((c) => c.key === column.key) : -1;

  return (
    <>
      <div className="lw-grid-frame" onPaste={onPaste} onCopy={onCopy}>
        <DataGrid<GridRow, unknown, string>
          ref={grid}
          aria-label={shape === 'variables' ? 'Variables' : 'Links'}
          className={`lw-grid rdg-${scheme}`}
          columns={rdgColumns}
          rows={gridRows}
          rowKeyGetter={(row) => row.element?.id ?? ''}
          rowHeight={32}
          headerRowHeight={36}
          enableVirtualization={virtualize}
          selectedRows={selectedRows}
          isRowSelectionDisabled={(row) => row.element === null}
          onSelectedRowsChange={(keys) => select([...keys].filter(Boolean))}
          sortColumns={sort}
          onSortColumnsChange={(next) => setSort(next.slice(-1))}
          rowClass={(row) => (row.element ? undefined : 'lw-row-new')}
          onActivePositionChange={({ rowIdx, row, column }) => {
            const col = dataColumn(column);
            if (rowIdx < 0 || col < 0) setRange(null);
            else {
              const position = { row: rowIdx, col };
              setRange((current) =>
                extend.current && current
                  ? { anchor: current.anchor, active: position }
                  : { anchor: position, active: position },
              );
            }
            extend.current = false;
            // Clicking a row's cell selects its element, unless several are selected (the boxes in the first
            // column add to the selection and take from it).
            const id = col >= 0 || column?.key === '#' ? row?.element?.id : undefined;
            const now = store.getState().selection;
            const ids = shape === 'variables' ? now.variables : now.links;
            if (id && ids.length <= 1 && ids[0] !== id) select([id]);
          }}
          onCellMouseDown={(_args, event) => {
            extend.current = event.shiftKey;
          }}
          onCellKeyDown={(args, event) => {
            if (args.mode !== 'ACTIVE') return;
            extend.current = event.shiftKey && event.key.startsWith('Arrow');
            const target = columns[dataColumn(args.column)];
            if ((event.key === 'Delete' || event.key === 'Backspace') && target) {
              event.preventGridDefault();
              event.preventDefault();
              clearRange();
            } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
              event.preventGridDefault();
              event.preventDefault();
              fillDown();
            }
          }}
        />
      </div>
      <Group justify="space-between" gap="xs" className="lw-table-foot" wrap="nowrap">
        <Text size="xs" c="dimmed" role="status">
          {count(elements.length, shape)}
          {filtered ? `, ${rows.length} shown` : ''}
          {selectedIds.length ? `, ${selectedIds.length} selected` : ''}
        </Text>
        <Text size="xs" c="dimmed" ta="right">
          Paste rows from a spreadsheet with Ctrl+V · Shift+arrows select cells · Ctrl+C copies · Ctrl+D fills
          down · Delete clears
        </Text>
      </Group>
    </>
  );
}

/** Removes the variables or links selected, with what depends on them, as one step. */
function RemoveSelected({ shape }: { shape: Shape }) {
  const store = useStudioStore();
  const edit = useEdit();
  const selection = useStudio((s) => s.selection);
  const ids = shape === 'variables' ? selection.variables : selection.links;
  const remove = () => {
    const vs = shape === 'variables' ? ids : [];
    const ls = shape === 'links' ? ids : [];
    const impact = removalImpact(store.getState().project, vs, ls);
    if ((impact.loops.length || impact.steps.length) && !window.confirm(removalQuestion(impact, vs.length)))
      return;
    const out = edit((p) => removeSelection(p, vs, ls));
    if (out) notifications.show({ message: `${out.summary} Ctrl+Z takes it back.`, autoClose: 6000 });
  };
  return (
    <Button
      size="xs"
      variant="default"
      leftSection={<IconTrash size={14} aria-hidden />}
      disabled={ids.length === 0}
      onClick={remove}
    >
      {ids.length > 1 ? `Remove ${count(ids.length, shape)}` : `Remove ${NOUN[shape][0]}`}
    </Button>
  );
}

/** The table, with its bar: `switcher` goes back to the canvas. */
export function TableView({ switcher }: { switcher?: ReactNode }) {
  const project = useStudio((s) => s.project);
  const [shape, setShape] = useState<Shape>('variables');
  const [search, setSearch] = useState('');
  return (
    <section className="lw-table" aria-label="Table">
      <Group className="lw-viewbar" gap="sm" justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          {switcher}
          <SegmentedControl
            size="xs"
            value={shape}
            onChange={(value) => setShape(value as Shape)}
            data={[
              { value: 'variables', label: `Variables (${project.variables.length})` },
              { value: 'links', label: `Links (${project.links.length})` },
            ]}
            aria-label="Show variables or links"
          />
          <TextInput
            size="xs"
            w={220}
            aria-label={`Search the ${shape}`}
            placeholder="Search"
            leftSection={<IconSearch size={14} aria-hidden />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
        </Group>
        <RemoveSelected shape={shape} />
      </Group>
      <ShapeTable key={shape} shape={shape} search={search} />
    </section>
  );
}
