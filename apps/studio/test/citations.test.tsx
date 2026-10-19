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

    const row = screen.getByRole('group', { name: 'Citation of Other (2021) [U], p. 11–12' });
    const note = within(row).getByRole('textbox', { name: 'Note: Other (2021) [U], p. 11–12' });
    await user.type(note, 'Fig. 2{Enter}');
    await user.click(within(row).getByRole('radio', { name: 'Strong' }));
    expect(store.getState().project.links[1]?.citations).toEqual([
      { source: 'U', pages: '11–12', strength: 'strong', note: 'Fig. 2' },
    ]);
    await user.click(
      within(row).getByRole('button', { name: 'Remove the citation of Other (2021) [U], p. 11–12' }),
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

  it('keeps the source chosen for the next citation, but never its strength', async () => {
    const { store, user } = renderStudio();
    store.getState().select({ links: ['L2'] });
    await screen.findByText('No source cited yet.');
    await chooseSource(user, /^Other \(2021\)/);
    const form = document.querySelector('.lw-cite-form') as HTMLElement;
    await user.type(within(form).getByRole('textbox', { name: 'Pages' }), '1');
    await user.click(within(form).getByRole('radio', { name: 'Strong' }));
    await user.click(within(form).getByRole('button', { name: 'Cite' }));
    // Choosing the same source again keeps it chosen; the strength is back to not rated.
    await chooseSource(user, /^Other \(2021\)/);
    expect((within(form).getByRole('radio', { name: 'Not rated' }) as HTMLInputElement).checked).toBe(true);
    await user.type(within(form).getByRole('textbox', { name: 'Pages' }), '2');
    await user.click(within(form).getByRole('button', { name: 'Cite' }));
    expect(store.getState().project.links[1]?.citations).toEqual([
      { source: 'U', pages: '1', strength: 'strong' },
      { source: 'U', pages: '2' },
    ]);
  });

  it('opens the source of a citation in the library', async () => {
    const { store, user } = renderStudio();
    store.getState().select({ links: ['L1'] });
    const source = await screen.findByRole('button', { name: 'Test (2020) [T]' });
    // No other source has its label, so its id is left off the screen.
    expect(source.textContent).toBe('Test (2020)');
    await user.click(source);
    expect(store.getState().workspace).toBe('sources');
    expect(store.getState().source).toBe('T');
  });

  it('tells apart the citations of two sources with the same label, and edits each one', async () => {
    const project = map();
    project.sources.push(
      { id: 'T2', label: 'Test (2020)', apa: 'Test, C. (2020). *A second fictitious source*. Test Press.' },
      { id: 'N', apa: 'Nolabel, D. (2019). *A fictitious source without a label*. Test Press.' },
    );
    project.links[0] = {
      ...(project.links[0] as Project['links'][number]),
      citations: [{ source: 'T', pages: '4' }, { source: 'T2', pages: '4' }, { source: 'N' }],
    };
    const { store, user } = renderStudio(project);
    store.getState().select({ links: ['L1'] });
    const first = await screen.findByRole('group', { name: 'Citation of Test (2020) [T], p. 4' });
    const second = screen.getByRole('group', { name: 'Citation of Test (2020) [T2], p. 4' });
    const third = screen.getByRole('group', { name: 'Citation of N' });
    // Each field is named for its own citation, so a screen reader tells them apart without the groups.
    for (const id of ['T', 'T2']) {
      const who = `Test (2020) [${id}], p. 4`;
      expect(screen.getByRole('textbox', { name: `Pages: ${who}` })).toBeTruthy();
      expect(screen.getByRole('textbox', { name: `Note: ${who}` })).toBeTruthy();
      expect(screen.getByRole('radiogroup', { name: `Strength of the evidence: ${who}` })).toBeTruthy();
      expect(screen.getByRole('button', { name: `Remove the citation of ${who}` })).toBeTruthy();
    }
    // Two sources share the label, so the id is shown with it; a source without a label shows its id.
    expect(within(first).getByRole('button', { name: 'Test (2020) [T]' }).textContent).toBe(
      'Test (2020) [T]',
    );
    expect(within(second).getByRole('button', { name: 'Test (2020) [T2]' }).textContent).toBe(
      'Test (2020) [T2]',
    );
    expect(within(third).getByRole('button', { name: 'N' }).textContent).toBe('N');

    await user.type(screen.getByRole('textbox', { name: 'Note: Test (2020) [T2], p. 4' }), 'Fig. 2{Enter}');
    const pages = screen.getByRole('textbox', { name: 'Pages: Test (2020) [T], p. 4' });
    await user.clear(pages);
    await user.type(pages, '5{Enter}');
    await user.click(
      within(
        screen.getByRole('radiogroup', { name: 'Strength of the evidence: Test (2020) [T2], p. 4' }),
      ).getByRole('radio', { name: 'Weak' }),
    );
    await user.type(screen.getByRole('textbox', { name: 'Note: N' }), 'Table 1{Enter}');
    expect(store.getState().project.links[0]?.citations).toEqual([
      { source: 'T', pages: '5' },
      { source: 'T2', pages: '4', note: 'Fig. 2', strength: 'weak' },
      { source: 'N', note: 'Table 1' },
    ]);
    // The changed pages rename that citation's fields; the other keeps its names.
    expect(screen.getByRole('group', { name: 'Citation of Test (2020) [T], p. 5' })).toBe(first);
    await user.click(screen.getByRole('button', { name: 'Remove the citation of Test (2020) [T2], p. 4' }));
    expect(store.getState().project.links[0]?.citations).toEqual([
      { source: 'T', pages: '5' },
      { source: 'N', note: 'Table 1' },
    ]);
  });

  it('tells apart two citations of one source at the same pages, which a file may hold', async () => {
    // A warning (duplicateCitation), not an error: the project opens, and each citation can be put right.
    const project = map();
    project.links[0] = {
      ...(project.links[0] as Project['links'][number]),
      citations: [
        { source: 'U' },
        { source: 'T', pages: '4', note: 'Fig. 1' },
        { source: 'T', pages: '4', note: 'Fig. 2' },
      ],
    };
    const { store, user } = renderStudio(project);
    store.getState().select({ links: ['L1'] });
    const at = (n: number) => `Test (2020) [T], p. 4, citation ${n} of 2`;
    const first = await screen.findByRole('group', { name: `Citation of ${at(1)}` });
    const second = screen.getByRole('group', { name: `Citation of ${at(2)}` });
    // Only the repeated ones are numbered, among themselves.
    expect(screen.getByRole('group', { name: 'Citation of Other (2021) [U]' })).toBeTruthy();
    for (const n of [1, 2]) {
      expect(screen.getByRole('textbox', { name: `Pages: ${at(n)}` })).toBeTruthy();
      expect(screen.getByRole('radiogroup', { name: `Strength of the evidence: ${at(n)}` })).toBeTruthy();
      expect(screen.getByRole('button', { name: `Remove the citation of ${at(n)}` })).toBeTruthy();
    }
    expect((within(first).getByRole('textbox', { name: `Note: ${at(1)}` }) as HTMLInputElement).value).toBe(
      'Fig. 1',
    );
    expect((within(second).getByRole('textbox', { name: `Note: ${at(2)}` }) as HTMLInputElement).value).toBe(
      'Fig. 2',
    );

    // The second one's pages corrected: neither is repeated any more, so both lose their numbers.
    const pages = screen.getByRole('textbox', { name: `Pages: ${at(2)}` });
    await user.clear(pages);
    await user.type(pages, '5{Enter}');
    expect(store.getState().project.links[0]?.citations).toEqual([
      { source: 'U' },
      { source: 'T', pages: '4', note: 'Fig. 1' },
      { source: 'T', pages: '5', note: 'Fig. 2' },
    ]);
    expect(screen.getByRole('group', { name: 'Citation of Test (2020) [T], p. 4' })).toBe(first);
    expect(screen.getByRole('group', { name: 'Citation of Test (2020) [T], p. 5' })).toBe(second);

    // Or the second one removed, by its own button: the first stays.
    store.getState().undo();
    await user.click(await screen.findByRole('button', { name: `Remove the citation of ${at(2)}` }));
    expect(store.getState().project.links[0]?.citations).toEqual([
      { source: 'U' },
      { source: 'T', pages: '4', note: 'Fig. 1' },
    ]);
    expect(screen.getByRole('group', { name: 'Citation of Test (2020) [T], p. 4' })).toBe(first);
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
