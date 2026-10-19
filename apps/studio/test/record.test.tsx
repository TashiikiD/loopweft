// The record view in jsdom: tools that set up a step by clicking on the stage, and the Map panel that does
// the same field by field. Each click is one undoable edit through the model's story operations.
import { createProject, type Project } from '@loopweft/model';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/app.tsx';
import { memoryRecovery } from '../src/state/recovery.ts';
import { createStudioStore, type StudioStore } from '../src/state/store.ts';

/** Three variables in a loop of + and − links, a named loop, and a one-step story. */
function small(): Project {
  const p = createProject({ title: 'Small map' });
  p.variables = [
    { id: 'births', label: 'Births', citations: [] },
    { id: 'population', label: 'Population', citations: [] },
    { id: 'deaths', label: 'Deaths', citations: [] },
  ];
  p.links = [
    { id: 'L1', from: 'births', to: 'population', sign: '+', citations: [] },
    { id: 'L2', from: 'population', to: 'births', sign: '+', citations: [] },
    { id: 'L3', from: 'population', to: 'deaths', sign: '+', citations: [] },
    { id: 'L4', from: 'deaths', to: 'population', sign: '-', citations: [] },
  ];
  p.loops = [{ id: 'R1', name: 'More people, more births', links: ['L1', 'L2'], citations: [] }];
  p.layout.positions = {
    births: { x: 300, y: 300 },
    population: { x: 700, y: 300 },
    deaths: { x: 1100, y: 300 },
  };
  p.story.scenes = [
    {
      id: 'S1',
      title: 'Growth',
      sources: [],
      steps: [{ id: '1', label: 'The loop', map: { variables: { base: 'dim' } }, overlays: [] }],
    },
  ];
  return p;
}

async function openStory(project: Project = small()) {
  const store: StudioStore = createStudioStore(project, { name: 'small.loopweft' });
  render(<App store={store} recovery={memoryRecovery()} env="test" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('tab', { name: 'Story' }));
  return { store, user };
}

const map = (store: StudioStore) => store.getState().project.story.scenes[0]?.steps[0]?.map;
const target = (name: RegExp) =>
  within(screen.getByRole('group', { name: 'Record: click variables and links' })).getByRole('button', {
    name,
  });

describe('the record view', () => {
  it('shows nothing to click until a tool is chosen', async () => {
    await openStory();
    expect(screen.queryByRole('group', { name: 'Record: click variables and links' })).toBeNull();
    expect(screen.getByText(/Choose a tool, then click/)).toBeTruthy();
  });

  it('puts what is clicked at a level, or back to the base, and hidden things stay clickable', async () => {
    const { store, user } = await openStory();
    await user.click(screen.getByRole('radio', { name: 'Show' }));
    await user.click(screen.getByRole('radio', { name: 'Active' }));
    await user.click(target(/^Births \(variable, normal\)/));
    await user.click(target(/^L1: Births → Population/));
    expect(map(store)).toEqual({ variables: { base: 'dim', active: ['births'] }, links: { active: ['L1'] } });
    expect(store.getState().past.at(-1)?.label).toBe('Step S1.1: L1 at active.');

    await user.click(screen.getByRole('radio', { name: 'Hide' }));
    await user.click(target(/^Deaths/));
    await user.click(target(/^L3:/));
    await user.click(target(/^L4:/));
    // Hidden, but drawn as a dashed outline, so it can be clicked back.
    expect(target(/^Deaths \(variable, hidden\)/)).toBeTruthy();
    expect(document.querySelectorAll('.lw-record-layer .hint').length).toBe(3);
    await user.click(screen.getByRole('radio', { name: 'Base' }));
    await user.click(target(/^Deaths/));
    expect(map(store)?.variables).toEqual({ base: 'dim', active: ['births'] });
  });

  it('marks trends, spreads a what-if by sign, builds pulses hop by hop and frames variables', async () => {
    const { store, user } = await openStory();
    await user.click(screen.getByRole('radio', { name: 'Trend' }));
    await user.click(screen.getByRole('radio', { name: '± Mixed' }));
    await user.click(target(/^Deaths/));
    expect(map(store)?.trends).toEqual({ deaths: 'mixed' });

    // Light the loop R1, then spread a rise in births along it.
    await user.click(screen.getByRole('radio', { name: 'Show' }));
    await user.click(screen.getByRole('radio', { name: 'Focus' }));
    await user.click(target(/^L1:/));
    await user.click(target(/^L2:/));
    await user.click(screen.getByRole('radio', { name: 'Spread' }));
    await user.click(target(/^Births/));
    expect(map(store)?.trends).toEqual({ deaths: 'mixed', births: 'up', population: 'up' });

    await user.click(screen.getByRole('radio', { name: 'Pulse' }));
    await user.click(target(/^L1:/));
    await user.click(target(/^L2:/));
    await user.keyboard('{Shift>}');
    await user.click(target(/^L3:/));
    await user.keyboard('{/Shift}');
    expect(map(store)?.pulses).toEqual({ hops: [['L1'], ['L2', 'L3']] });

    await user.click(screen.getByRole('radio', { name: 'Frame' }));
    await user.click(target(/^Births/));
    await user.click(target(/^Population/));
    await user.click(target(/^Births/));
    expect(map(store)?.camera).toEqual({ fit: ['population'] });
    expect(store.getState().past.at(-1)?.label).toBe('Step S1.1: the camera no longer frames births.');
  });
});

describe('the Map panel', () => {
  it('sets levels, badges, pulses round a loop and the camera, field by field', async () => {
    const { store, user } = await openStory();
    await user.click(
      within(screen.getByRole('complementary', { name: 'Story panel' })).getByRole('tab', { name: 'Map' }),
    );
    await user.click(screen.getByRole('button', { name: 'Loop badges' }));
    await user.click(screen.getByRole('button', { name: 'Pulses' }));
    // A loop's badge and name, then the pulse round it.
    await user.click(screen.getByRole('checkbox', { name: 'Name R1' }));
    expect(map(store)).toMatchObject({ loops: ['R1'], loopNames: ['R1'] });
    await user.click(screen.getByRole('checkbox', { name: 'Badge R1' }));
    expect(map(store)?.loops).toBeUndefined();
    expect(map(store)?.loopNames).toBeUndefined();
    await user.click(screen.getByRole('button', { name: 'Pulse round R1' }));
    expect(map(store)?.pulses).toEqual({ hops: [['L1'], ['L2']] });
    await user.click(screen.getByRole('button', { name: 'Remove hop 2' }));
    expect(map(store)?.pulses).toEqual({ hops: [['L1']] });

    // An element by name at a level, then taken back off its list.
    await user.click(screen.getByRole('combobox', { name: 'Put a variable or link' }));
    await user.click(screen.getByRole('option', { name: 'L4: Deaths → Population' }));
    await user.click(screen.getByRole('button', { name: 'Put' }));
    expect(map(store)?.links).toEqual({ focus: ['L4'] });
    await user.click(screen.getByRole('button', { name: 'Remove L4' }));
    expect(map(store)?.links).toBeUndefined();

    // The camera frames the lit variables, then the whole map again.
    await user.click(screen.getByRole('combobox', { name: 'Put a variable or link' }));
    await user.click(screen.getByRole('option', { name: 'L1: Births → Population' }));
    await user.click(screen.getByRole('button', { name: 'Put' }));
    await user.click(screen.getByRole('button', { name: 'Frame what is lit' }));
    expect(map(store)?.camera).toEqual({ fit: ['births', 'population'] });
    await user.click(screen.getByRole('button', { name: 'Whole map' }));
    expect(map(store)?.camera).toBeUndefined();
  });

  it('adds one variable after another to what the camera frames and where ambient pulses start, emptying the list each time', async () => {
    const { store, user } = await openStory();
    const panel = within(screen.getByRole('complementary', { name: 'Story panel' }));
    await user.click(panel.getByRole('tab', { name: 'Map' }));
    const pick = async (label: string, option: string) => {
      const field = screen.getByRole('combobox', { name: label }) as HTMLInputElement;
      await user.click(field);
      await user.click(screen.getByRole('option', { name: option }));
      // The list empties itself, ready for the next one.
      expect((screen.getByRole('combobox', { name: label }) as HTMLInputElement).value).toBe('');
    };
    await pick('Add a variable to frame', 'Births (births)');
    await pick('Add a variable to frame', 'Population (population)');
    expect(map(store)?.camera).toEqual({ fit: ['births', 'population'] });

    await user.click(screen.getByRole('button', { name: 'Ambient pulses' }));
    await user.click(screen.getByRole('combobox', { name: 'Start from' }));
    await user.click(screen.getByRole('option', { name: 'Deaths (deaths)' }));
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(map(store)?.ambient).toEqual({ from: ['deaths'], tone: 'harm' });
    await pick('Add a start', 'Births (births)');
    await pick('Add a start', 'Population (population)');
    expect(map(store)?.ambient).toEqual({ from: ['deaths', 'births', 'population'], tone: 'harm' });
  });
});
