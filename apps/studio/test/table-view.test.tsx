// The table view and the shorthand box in jsdom: cells typed and pasted as one undoable step each, rows
// added from the last line, rows selected and removed, and links typed as text.
import { createProject, type Project } from '@loopweft/model';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/app.tsx';
import { memoryRecovery } from '../src/state/recovery.ts';
import { createStudioStore, type StudioStore } from '../src/state/store.ts';

function small(): Project {
  const p = createProject({ title: 'Small map' });
  p.types.categories = [{ id: 'people', name: 'People' }];
  p.variables = [
    { id: 'births', label: 'Births', category: 'people', citations: [] },
    { id: 'population', label: 'Population', citations: [] },
  ];
  p.links = [
    { id: 'L1', from: 'births', to: 'population', sign: '+', citations: [] },
    { id: 'L2', from: 'population', to: 'births', sign: '?', citations: [] },
  ];
  return p;
}

async function openTable(project: Project = small()) {
  const store: StudioStore = createStudioStore(project, { name: 'small.loopweft' });
  render(<App store={store} recovery={memoryRecovery()} env="test" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('radio', { name: 'Table' }));
  await screen.findByRole('grid', { name: 'Variables' });
  return { store, user };
}

const grid = (name: 'Variables' | 'Links') => screen.getByRole('grid', { name });

/** A cell of a row (1 = the first; the row after the last is the new row) in the column of that name. */
function cell(name: 'Variables' | 'Links', row: number, column: string): HTMLElement {
  const header = within(grid(name))
    .getAllByRole('columnheader')
    .find((h) => h.textContent === column);
  const index = header?.getAttribute('aria-colindex');
  if (!index) throw new Error(`no column ${column}`);
  const rows = within(grid(name)).getAllByRole('row').slice(1);
  const found = rows[row - 1]?.querySelector(`[role="gridcell"][aria-colindex="${index}"]`);
  if (!found) throw new Error(`no row ${row} in ${name}`);
  return found as HTMLElement;
}

const paste = (text: string) =>
  fireEvent.paste(document.activeElement as Element, { clipboardData: { getData: () => text } });

describe('the table view', () => {
  it('shows the variables as a table, and edits a cell as one undoable step', async () => {
    const { store, user } = await openTable();
    expect(cell('Variables', 1, 'Name').textContent).toBe('Births');
    expect(cell('Variables', 1, 'Category').textContent).toBe('People');
    expect(screen.getByRole('status', { name: '' }).textContent).toBe('2 variables');

    await user.dblClick(cell('Variables', 1, 'Name'));
    await user.keyboard('{Control>}a{/Control}Birth rate{Enter}');
    expect(store.getState().project.variables[0]?.label).toBe('Birth rate');
    expect(cell('Variables', 1, 'Name').textContent).toBe('Birth rate');
    // The row's variable is selected, so the inspector shows it.
    expect(store.getState().selection.variables).toEqual(['births']);
    expect((screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('Birth rate');

    await user.click(screen.getByRole('button', { name: 'Undo: Edit Name' }));
    expect(store.getState().project.variables[0]?.label).toBe('Births');
  });

  it('adds a variable from the last line, and a link once its two ends are typed', async () => {
    const { store, user } = await openTable();
    await user.dblClick(cell('Variables', 3, 'Name'));
    await user.keyboard('Deaths{Enter}');
    expect(store.getState().project.variables.map((v) => v.id)).toEqual(['births', 'population', 'deaths']);

    await user.click(screen.getByRole('radio', { name: 'Links (2)' }));
    await user.dblClick(cell('Links', 3, 'From'));
    await user.keyboard('deaths{Tab}');
    // Half a link is kept in the new row, not added.
    expect(store.getState().project.links).toHaveLength(2);
    expect(cell('Links', 3, 'From').textContent).toBe('deaths');
    await user.keyboard('{Enter}');
    await user.keyboard('Population{Enter}');
    expect(store.getState().project.links[2]).toEqual({
      id: 'L3',
      from: 'deaths',
      to: 'population',
      sign: '?',
      citations: [],
    });
    expect(cell('Links', 3, 'Sign').textContent).toBe('?');
  });

  it('pastes rows from a spreadsheet as one step, making the variables they name', async () => {
    const { store, user } = await openTable();
    await user.click(screen.getByRole('radio', { name: 'Links (2)' }));
    await user.click(cell('Links', 3, 'From'));
    paste('From\tTo\tSign\r\nDeaths\tPopulation\t-\r\nBirths\tDeaths\t+\r\n');
    expect(await screen.findByText('Pasted 2 rows')).toBeTruthy();
    expect(
      screen.getByText(/Added 2 links\. Made variable "Deaths"\. Note: the first line named the columns/),
    ).toBeTruthy();
    expect(store.getState().project.links.map((l) => `${l.from}>${l.to}${l.sign}`)).toEqual([
      'births>population+',
      'population>births?',
      'deaths>population-',
      'births>deaths+',
    ]);

    await user.keyboard('{Control>}z{/Control}');
    expect(store.getState().project.links).toHaveLength(2);
    expect(store.getState().project.variables).toHaveLength(2);
  });

  it('changes nothing when a pasted cell cannot be read, and says which', async () => {
    const { store, user } = await openTable();
    await user.click(screen.getByRole('radio', { name: 'Links (2)' }));
    await user.click(cell('Links', 1, 'Sign'));
    paste('sideways\nopposite');
    expect(await screen.findByText('Nothing was changed')).toBeTruthy();
    expect(screen.getByText('Row 1, Sign: the sign is +, − or ?, not "sideways".')).toBeTruthy();
    expect(store.getState().project.links.map((l) => l.sign)).toEqual(['+', '?']);
    expect(store.getState().past).toHaveLength(0);
  });

  it('finds rows, and removes the rows selected with what depends on them', async () => {
    const { store, user } = await openTable();
    await user.type(screen.getByRole('textbox', { name: 'Search the variables' }), 'pop');
    expect(within(grid('Variables')).getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText('2 variables, 1 shown')).toBeTruthy();
    await user.clear(screen.getByRole('textbox', { name: 'Search the variables' }));

    const rows = within(grid('Variables')).getAllByRole('row').slice(1);
    for (const row of rows.slice(0, 2)) await user.click(within(row).getByRole('checkbox'));
    expect(store.getState().selection.variables).toEqual(['births', 'population']);
    await user.click(screen.getByRole('button', { name: 'Remove 2 variables' }));
    expect(store.getState().project.variables).toHaveLength(0);
    expect(store.getState().project.links).toHaveLength(0);
    expect(await screen.findByText('Removed 2 variables and 2 links. Ctrl+Z takes it back.')).toBeTruthy();
  });

  it('copies a range of cells as spreadsheet text', async () => {
    const { user } = await openTable();
    await user.click(cell('Variables', 1, 'Name'));
    await user.keyboard('{Shift>}{ArrowDown}{ArrowRight}{/Shift}');
    let copied = '';
    fireEvent.copy(document.activeElement as Element, {
      clipboardData: { setData: (_type: string, text: string) => (copied = text) },
    });
    expect(copied).toBe('Births\t\nPopulation\t');
  });
});

describe('the shorthand box', () => {
  it('previews links typed as text and adds them as one step', async () => {
    const { store, user } = await openTable();
    await user.click(screen.getByRole('tab', { name: 'Shorthand' }));
    const area = screen.getByRole('textbox', { name: 'Shorthand' });
    await user.type(area, 'Deaths -> Population (-){Enter}Fertility -> Births');
    expect(await screen.findByText(/^2 links · 2 new variables \(Deaths, Fertility\)/)).toBeTruthy();
    expect(screen.getByText(/Warning, line 2/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Add 2 links' }));
    expect(store.getState().project.links).toHaveLength(4);
    expect(store.getState().selection.links).toEqual(['L3', 'L4']);
    expect(await screen.findByText('Added 2 links and 2 variables')).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Shorthand' }) as HTMLTextAreaElement).value).toBe('');
    act(() => {
      store.getState().undo();
    });
    expect(store.getState().project.links).toHaveLength(2);
  });

  it('lists the errors and adds nothing while a line has one', async () => {
    const { store, user } = await openTable();
    await user.click(screen.getByRole('tab', { name: 'Shorthand' }));
    await user.type(screen.getByRole('textbox', { name: 'Shorthand' }), 'Births -> Deaths (+, weight=heavy)');
    expect(await screen.findByText(/^Error, line 1/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add' })).toHaveProperty('disabled', true);
    expect(store.getState().project.links).toHaveLength(2);
  });
});
