// The Layout, Loops and Ripple panels in jsdom: an automatic layout as one step, loops found and named, and
// a what-if ripple shown by step.
import { addLink, createProject, type Project } from '@loopweft/model';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/app.tsx';
import { memoryRecovery } from '../src/state/recovery.ts';
import { createStudioStore, type StudioStore } from '../src/state/store.ts';

/** Births and deaths round a population: one reinforcing loop, one balancing, and an unknown link. */
function population(): Project {
  const p = createProject({ title: 'Population' });
  p.types.categories = [{ id: 'people', name: 'People' }];
  p.variables = [
    { id: 'births', label: 'Births', category: 'people', citations: [] },
    { id: 'population', label: 'Population', category: 'people', citations: [] },
    { id: 'deaths', label: 'Deaths', citations: [] },
    { id: 'crowding', label: 'Crowding', citations: [] },
  ];
  p.links = [
    { id: 'L1', from: 'births', to: 'population', sign: '+', citations: [] },
    { id: 'L2', from: 'population', to: 'births', sign: '+', citations: [] },
    { id: 'L3', from: 'population', to: 'deaths', sign: '+', citations: [] },
    { id: 'L4', from: 'deaths', to: 'population', sign: '-', citations: [] },
    { id: 'L5', from: 'population', to: 'crowding', sign: '?', citations: [] },
  ];
  p.layout.positions = {
    births: { x: 100, y: 100 },
    population: { x: 300, y: 100, pinned: true },
    deaths: { x: 500, y: 100 },
    crowding: { x: 300, y: 300 },
  };
  return p;
}

async function openPanel(panel: 'Layout' | 'Loops' | 'Ripple', project: Project = population()) {
  const store: StudioStore = createStudioStore(project, { name: 'population.loopweft' });
  render(<App store={store} recovery={memoryRecovery()} env="test" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('tab', { name: panel }));
  return { store, user };
}

describe('the Layout panel', () => {
  it('lays the map out as one step, keeping pinned variables, and shows the whole map again', async () => {
    const { store, user } = await openPanel('Layout');
    expect(screen.getByText('4 variables placed; 1 pinned.')).toBeTruthy();
    await user.click(screen.getByRole('radio', { name: /^Flow/ }));
    expect(screen.queryByRole('textbox', { name: 'Seed' })).toBeNull();
    const fit = store.getState().fit;
    await user.click(screen.getByRole('button', { name: 'Lay out the map' }));
    const positions = store.getState().project.layout.positions;
    expect(positions.population).toEqual({ x: 300, y: 100, pinned: true });
    expect(positions.births).not.toEqual({ x: 100, y: 100 });
    expect(store.getState().fit).toBe(fit + 1);
    expect(store.getState().past.at(-1)?.label).toMatch(/^Laid out the map as a flow from causes to effects/);

    await user.click(screen.getByRole('button', { name: 'Unpin all 1' }));
    expect(store.getState().project.layout.positions.population?.pinned).toBeUndefined();
  });

  it('says where variables without a place are drawn: beside the placed ones, or as a constellation', async () => {
    const partial = population();
    delete partial.layout.positions.crowding;
    await openPanel('Layout', partial);
    expect(
      screen.getByText(
        '3 variables placed, 1 not yet (drawn beside the placed ones until placed); 1 pinned.',
      ),
    ).toBeTruthy();
  });

  it('says a map with no places is drawn as a constellation', async () => {
    const bare = population();
    bare.layout.positions = {};
    await openPanel('Layout', bare);
    expect(
      screen.getByText('0 variables placed, 4 not yet (drawn as a constellation until placed); none pinned.'),
    ).toBeTruthy();
  });

  it('takes a seed for the seeded layouts, and only a whole number', async () => {
    const { store, user } = await openPanel('Layout');
    const seed = screen.getByRole('textbox', { name: 'Seed' });
    await user.clear(seed);
    expect(screen.getByRole('button', { name: 'Lay out the map' })).toHaveProperty('disabled', true);
    await user.type(seed, '7');
    await user.click(screen.getByRole('button', { name: 'Lay out the map' }));
    expect(store.getState().past.at(-1)?.label).toMatch(/as a constellation by category \(seed 7\)/);
    expect(store.getState().project.layout.groups.map((g) => g.id)).toEqual(['people']);
  });
});

describe('the Loops panel', () => {
  it('finds every loop, and names one', async () => {
    const { store, user } = await openPanel('Loops');
    expect(screen.getByText(/None yet/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Find loops' }));
    expect(await screen.findByText('2 loops: 1 reinforcing, 1 balancing.')).toBeTruthy();
    expect(screen.getByText('By length: 2 links 2')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Show the loop Births → Population → Births' }));
    expect(store.getState().selection).toEqual({
      variables: ['births', 'population'],
      links: ['L1', 'L2'],
      loop: null,
    });
    await user.click(screen.getAllByRole('button', { name: 'Name this loop' })[0] as HTMLElement);
    await user.type(screen.getByRole('textbox', { name: 'Name of the loop' }), 'More births{Enter}');
    expect(store.getState().project.loops).toEqual([
      { id: 'R1', name: 'More births', links: ['L1', 'L2'], citations: [] },
    ]);
    expect(screen.getByText('Named R1: More births')).toBeTruthy();
    expect(store.getState().selection.loop).toBe('R1');
    // Naming a loop leaves the search true; a new link does not.
    expect(screen.queryByText(/The map has changed since/)).toBeNull();
    act(() => {
      store.getState().edit((p) => addLink(p, { from: 'deaths', to: 'births', sign: '-' }));
    });
    expect(screen.getByText(/The map has changed since/)).toBeTruthy();
  });

  it('edits a named loop, and removes its name only', async () => {
    const p = population();
    p.loops = [{ id: 'B1', name: 'Deaths', links: ['L3', 'L4'], citations: [] }];
    const { store, user } = await openPanel('Loops', p);
    await user.click(screen.getByRole('button', { name: 'Deaths: show and edit' }));
    expect(store.getState().selection.loop).toBe('B1');
    await user.type(screen.getByRole('textbox', { name: 'Archetype' }), 'Balancing loop{Enter}');
    expect(store.getState().project.loops[0]?.archetype).toBe('Balancing loop');
    await user.click(screen.getByRole('button', { name: 'Remove the name' }));
    expect(store.getState().project.loops).toEqual([]);
    expect(store.getState().project.links).toHaveLength(5);
  });
});

describe('the Ripple panel', () => {
  it('starts from the selected variable and shows the change by step, with what it does not cross', async () => {
    const store: StudioStore = createStudioStore(population(), { name: 'population.loopweft' });
    store.getState().select({ variables: ['births'] });
    render(<App store={store} recovery={memoryRecovery()} env="test" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: 'Ripple' }));
    expect(screen.getByText('It reaches 2 variables in 2 steps: 2 ▲.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Population rises' })).toBeTruthy();
    expect(screen.getByText(/Back to Births at step 2 along L2: ▲ the same way/)).toBeTruthy();
    expect(screen.getByText(/Not crossed: 1 link of unknown sign \(L5\)/)).toBeTruthy();
    expect(screen.getByText(/Pushed the other way later.*Population \(L4\)/)).toBeTruthy();

    await user.click(screen.getByRole('radio', { name: '▼ It falls' }));
    expect(screen.getByRole('button', { name: 'Deaths falls' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Select it on the map' }));
    expect(store.getState().selection.variables).toEqual(['births', 'population', 'deaths']);
    expect(store.getState().selection.links).toEqual(['L1', 'L3']);
  });
});
