// Citing in the Studio, in jsdom: the inspector cites a source on one element or on a whole selection,
// changes a citation's pages, strength and note, and removes it; the Coverage view lists what cites nothing
// and cites it in one go.
import { createProject, type Project } from '@loopweft/model';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/app.tsx';
import { memoryRecovery } from '../src/state/recovery.ts';
import { createStudioStore, type StudioStore } from '../src/state/store.ts';

/** Three variables, three links (one cited), one named loop, two sources. */
function map(): Project {
  const p = createProject({ title: 'Small map' });
  p.variables = [
    { id: 'births', label: 'Births', citations: [] },
    { id: 'population', label: 'Population', citations: [] },
    { id: 'deaths', label: 'Deaths', citations: [] },
  ];
  p.links = [
    { id: 'L1', from: 'births', to: 'population', sign: '+', citations: [{ source: 'T', pages: '4' }] },
    { id: 'L2', from: 'population', to: 'births', sign: '+', citations: [] },
    { id: 'L3', from: 'population', to: 'deaths', sign: '+', citations: [] },
  ];
  p.loops = [{ id: 'R1', name: 'More people, more births', links: ['L1', 'L2'], citations: [] }];
  p.layout.positions = {
    births: { x: 300, y: 300 },
    population: { x: 700, y: 300 },
    deaths: { x: 1000, y: 300 },
  };
  p.sources = [
    { id: 'T', label: 'Test (2020)', apa: 'Test, A. (2020). *A fictitious source for tests*. Test Press.' },
    { id: 'U', label: 'Other (2021)', apa: 'Other, B. (2021). *Another fictitious source*. Test Press.' },
  ];
  return p;
}

function renderStudio(project: Project = map()) {
  const store: StudioStore = createStudioStore(project, { name: 'small.loopweft' });
  render(<App store={store} recovery={memoryRecovery()} env="test" />);
  return { store, user: userEvent.setup() };
}

async function chooseSource(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(screen.getByRole('combobox', { name: /^Cite a source/ }));
  await user.click(screen.getByRole('option', { name }));
}

describe('citing in the inspector', () => {
  it('cites a source on a link with pages and strength, then changes and removes it', async () => {
    const { store, user } = renderStudio();
    store.getState().select({ links: ['L2'] });
    expect(await screen.findByText('No source cited yet.')).toBeTruthy();
    await chooseSource(user, /^Other \(2021\)/);
    await user.type(screen.getByRole('textbox', { name: 'Pages' }), '11–12');
    await user.click(screen.getByRole('radio', { name: 'Moderate' }));
    await user.click(screen.getByRole('button', { name: 'Cite' }));
    expect(store.getState().project.links[1]?.citations).toEqual([
      { source: 'U', pages: '11–12', strength: 'moderate' },
    ]);
    expect(store.getState().past.at(-1)?.label).toBe('Cited U pp. 11–12 on L2.');

    const row = document.querySelector('.lw-citation') as HTMLElement;
    const note = within(row).getByRole('textbox', { name: 'Note' });
    await user.type(note, 'Fig. 2{Enter}');
    await user.click(within(row).getByRole('radio', { name: 'Strong' }));
    expect(store.getState().project.links[1]?.citations).toEqual([
      { source: 'U', pages: '11–12', strength: 'strong', note: 'Fig. 2' },
    ]);
    await user.click(
      within(row).getByRole('button', { name: 'Remove the citation of Other (2021) (11–12)' }),
    );
    expect(store.getState().project.links[1]?.citations).toEqual([]);
    store.getState().undo();
    expect(store.getState().project.links[1]?.citations).toHaveLength(1);
  });

  it('cites one source on everything selected, leaving what already cites it', async () => {
    const { store, user } = renderStudio();
    store.getState().select({ variables: ['births'], links: ['L1', 'L3'] });
    expect(await screen.findByText('Cite a source on all 3 selected')).toBeTruthy();
    await chooseSource(user, /^Test \(2020\)/);
    await user.type(screen.getByRole('textbox', { name: 'Pages' }), '4');
    await user.click(screen.getByRole('button', { name: 'Cite' }));
    const { project } = store.getState();
    expect(project.variables[0]?.citations).toEqual([{ source: 'T', pages: '4' }]);
    expect(project.links[2]?.citations).toEqual([{ source: 'T', pages: '4' }]);
    expect(project.links[0]?.citations).toEqual([{ source: 'T', pages: '4' }]);
    expect(await screen.findByText('Cited T p. 4 on births and L3. L1 already cited it.')).toBeTruthy();
  });

  it('opens the source of a citation in the library', async () => {
    const { store, user } = renderStudio();
    store.getState().select({ links: ['L1'] });
    await user.click(await screen.findByRole('button', { name: 'Test (2020)' }));
    expect(store.getState().workspace).toBe('sources');
    expect(store.getState().source).toBe('T');
  });

  it('sends a map without sources to the Sources workspace', async () => {
    const project = map();
    project.sources = [];
    project.links[0] = { ...(project.links[0] as Project['links'][number]), citations: [] };
    const { store, user } = renderStudio(project);
    store.getState().select({ links: ['L2'] });
    await user.click(await screen.findByRole('button', { name: 'Add one in Sources' }));
    expect(store.getState().workspace).toBe('sources');
  });
});

describe('the Coverage view', () => {
  it('counts what cites a source, lists what does not, and cites the chosen in one go', async () => {
    const { store, user } = renderStudio();
    await user.click(screen.getByRole('tab', { name: 'Sources' }));
    await user.click(screen.getByRole('radio', { name: 'Coverage' }));
    expect(screen.getByText('1 of 3 cite a source')).toBeTruthy();
    expect(screen.getByText('0 strong · 0 moderate · 0 weak · 1 not rated')).toBeTruthy();
    const table = screen.getByRole('table', { name: 'Links and their citations' });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    await user.click(within(table).getByRole('checkbox', { name: 'Choose them all' }));
    expect(screen.getByRole('heading', { name: '2 chosen' })).toBeTruthy();
    await chooseSource(user, /^Other \(2021\)/);
    await user.click(screen.getByRole('radio', { name: 'Weak' }));
    await user.click(screen.getByRole('button', { name: 'Cite' }));
    expect(store.getState().project.links.map((l) => l.citations.length)).toEqual([1, 1, 1]);
    expect(screen.getByText('Every one of the 3 links cites a source.')).toBeTruthy();

    await user.click(screen.getByRole('radio', { name: 'Variables' }));
    await user.click(screen.getByRole('checkbox', { name: 'Choose Deaths' }));
    await user.click(screen.getByRole('button', { name: 'Select 1 on the map' }));
    expect(store.getState().workspace).toBe('map');
    expect(store.getState().selection.variables).toEqual(['deaths']);
  });
});

describe('citing a named loop', () => {
  it('cites a source on a loop in the Loops panel', async () => {
    const { store, user } = renderStudio();
    await user.click(screen.getByRole('tab', { name: 'Loops' }));
    await user.click(screen.getByRole('button', { name: 'More people, more births: show and edit' }));
    await chooseSource(user, /^Test \(2020\)/);
    await user.click(screen.getByRole('button', { name: 'Cite' }));
    expect(store.getState().project.loops[0]?.citations).toEqual([{ source: 'T' }]);
  });
});
