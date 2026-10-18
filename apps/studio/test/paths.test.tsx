// The Paths and Connected panels in jsdom: paths between two variables, shortest first with their signs and
// selected on the map; the most-connected variables, always with the caveat.
import { CONNECTED_CAVEAT, createProject, type Project } from '@loopweft/model';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/app.tsx';
import { memoryRecovery } from '../src/state/recovery.ts';
import { createStudioStore, type StudioStore } from '../src/state/store.ts';

/** a → b → d and a → c → d (one − link), and d → a. */
function diamond(): Project {
  const p = createProject({ title: 'Diamond' });
  p.variables = ['a', 'b', 'c', 'd'].map((id) => ({ id, label: id.toUpperCase(), citations: [] }));
  p.links = [
    { id: 'L1', from: 'a', to: 'b', sign: '+', citations: [] },
    { id: 'L2', from: 'b', to: 'd', sign: '+', citations: [] },
    { id: 'L3', from: 'a', to: 'c', sign: '+', citations: [] },
    { id: 'L4', from: 'c', to: 'd', sign: '-', citations: [] },
    { id: 'L5', from: 'd', to: 'a', sign: '+', citations: [] },
  ];
  p.layout.positions = {
    a: { x: 0, y: 0 },
    b: { x: 200, y: -100 },
    c: { x: 200, y: 100 },
    d: { x: 400, y: 0 },
  };
  return p;
}

async function openPanel(panel: 'Paths' | 'Connected', select: string[] = []) {
  const store: StudioStore = createStudioStore(diamond(), { name: 'diamond.loopweft' });
  store.getState().select({ variables: select });
  render(<App store={store} recovery={memoryRecovery()} env="test" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('tab', { name: panel }));
  return { store, user };
}

describe('the Paths panel', () => {
  it('lists the paths between the two selected variables, with their signs, and selects one', async () => {
    const { store, user } = await openPanel('Paths', ['a', 'd']);
    expect(screen.getByRole('status', { name: 'Paths found' }).textContent).toBe(
      '2 paths lead from A to D: 1 +, 1 −. The shortest has 2 links.',
    );
    expect(screen.getByText(/Paths of both signs/)).toBeTruthy();
    const list = screen.getByRole('list', { name: 'Paths' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((i) => i.getAttribute('aria-label')),
    ).toEqual(['+ (same direction): A → B → D', '− (opposite direction): A → C → D']);
    await user.click(within(list).getByRole('listitem', { name: '− (opposite direction): A → C → D' }));
    expect(store.getState().selection).toEqual({
      variables: ['a', 'c', 'd'],
      links: ['L3', 'L4'],
      loop: null,
    });
    await user.click(screen.getByRole('button', { name: 'Select these 2 on the map' }));
    expect(store.getState().selection.links).toEqual(['L1', 'L2', 'L3', 'L4']);
  });

  it('swaps the ends, and says when no path is short enough', async () => {
    const { user } = await openPanel('Paths', ['b', 'c']);
    expect(screen.getByRole('status', { name: 'Paths found' }).textContent).toBe(
      '1 path leads from B to C: 1 +. The shortest has 3 links.',
    );
    await user.type(screen.getByRole('textbox', { name: 'At most this many links' }), '2');
    expect(screen.getByRole('status', { name: 'Paths found' }).textContent).toBe(
      'No path leads from B to C in 2 links or fewer.',
    );
    await user.click(screen.getByRole('button', { name: 'Swap from and to' }));
    expect(screen.getByRole('status', { name: 'Paths found' }).textContent).toBe(
      'No path leads from C to B in 2 links or fewer.',
    );
  });
});

describe('the Connected panel', () => {
  it('ranks the variables by their links and always says that connected does not mean leverage', async () => {
    const { store, user } = await openPanel('Connected');
    expect(screen.getByText(CONNECTED_CAVEAT)).toBeTruthy();
    const table = screen.getByRole('table', { name: 'The most-connected variables' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(
      rows.map((r) =>
        within(r)
          .getAllByRole('cell')
          .map((c) => c.textContent),
      ),
    ).toEqual([
      ['A1 in · 2 out', '3', '3', '0'],
      ['D2 in · 1 out', '3', '3', '0'],
      ['B1 in · 1 out', '2', '2', '0'],
      ['C1 in · 1 out', '2', '2', '0'],
    ]);
    await user.click(within(table).getByRole('button', { name: 'Select D' }));
    expect(store.getState().selection.variables).toEqual(['d']);
  });
});
