// The record view in jsdom: tools that set up a step by clicking on the stage, and the Map panel that does
// the same field by field. Each click is one undoable edit through the model's story operations.
import { fitCamera, mapGeometry } from '@loopweft/layout';
import { addLink, createProject, type Project } from '@loopweft/model';
import { act, render, screen, within } from '@testing-library/react';
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

  it('spreads over the whole map on a step that lights nothing, lighting what it reaches, and says so', async () => {
    const { store, user } = await openStory();
    await user.click(screen.getByRole('radio', { name: 'Spread' }));
    await user.click(target(/^Births/));
    expect(map(store)).toEqual({
      variables: { base: 'dim', focus: ['births', 'population', 'deaths'] },
      links: { focus: ['L1', 'L3'] },
      trends: { births: 'up', population: 'up', deaths: 'up' },
    });
    expect(
      await screen.findByText(
        'Step S1.1: births ▲; the step lit no links, so the spread followed the whole map by sign to 2 variables, and lit them, births and the 2 links it crossed. L4 would push the other way later; it is not lit, so the story check flags it only once lit with Show (Focus or Active).',
      ),
    ).toBeTruthy();
  });

  it('works from the keyboard: Tab reaches what the tool applies to, and Enter or Space applies it', async () => {
    const { store, user } = await openStory();
    const tabbable = (name: RegExp) => target(name).getAttribute('tabindex') === '0';
    // Pulse: the links are in the Tab order; the variables are not, and say they are not available.
    await user.click(screen.getByRole('radio', { name: 'Pulse' }));
    expect([/^L1:/, /^L2:/, /^L3:/, /^L4:/].every(tabbable)).toBe(true);
    expect([/^Births/, /^Population/, /^Deaths/].some(tabbable)).toBe(false);
    expect(target(/^Births/).getAttribute('aria-disabled')).toBe('true');
    target(/^L1:/).focus();
    await user.keyboard('{Enter}');
    target(/^L2:/).focus();
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    target(/^L3:/).focus();
    await user.keyboard(' ');
    expect(map(store)?.pulses).toEqual({ hops: [['L1', 'L2'], ['L3']] });
    // Trend reaches the variables, not the links; Show reaches both.
    await user.click(screen.getByRole('radio', { name: 'Trend' }));
    expect(tabbable(/^Births/) && !tabbable(/^L1:/)).toBe(true);
    expect(target(/^L1:/).getAttribute('aria-disabled')).toBe('true');
    target(/^Deaths/).focus();
    await user.keyboard('{Enter}');
    expect(map(store)?.trends).toEqual({ deaths: 'up' });
    await user.click(screen.getByRole('radio', { name: 'Show' }));
    expect(tabbable(/^Births/) && tabbable(/^L1:/)).toBe(true);
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
    await user.click(await screen.findByRole('checkbox', { name: 'Name R1' }, { timeout: 5000 }));
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
    // The section opens with a transition: wait for its field.
    await user.click(await screen.findByRole('combobox', { name: 'Start from' }, { timeout: 5000 }));
    await user.click(screen.getByRole('option', { name: 'Deaths (deaths)' }));
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(map(store)?.ambient).toEqual({ from: ['deaths'], tone: 'harm' });
    await pick('Add a start', 'Births (births)');
    await pick('Add a start', 'Population (population)');
    expect(map(store)?.ambient).toEqual({ from: ['deaths', 'births', 'population'], tone: 'harm' });
  });

  it('offers a zoom limit only where the camera keeps it, and refuses one it would ignore', async () => {
    const { store, user } = await openStory();
    const panel = within(screen.getByRole('complementary', { name: 'Story panel' }));
    await user.click(panel.getByRole('tab', { name: 'Map' }));
    const zoom = () => screen.getByRole('textbox', { name: 'Zoom at most' }) as HTMLInputElement;
    // The whole map as it is: the limit would do nothing, so it is off, and says when it counts.
    expect(zoom().disabled).toBe(true);
    expect(
      screen.getByText('Only when the camera frames variables, or sets the whole map aside'),
    ).toBeTruthy();
    // Framing a variable: no limit below the whole map's zoom, which the camera never goes beneath.
    await user.click(screen.getByRole('combobox', { name: 'Add a variable to frame' }));
    await user.click(screen.getByRole('option', { name: 'Births (births)' }));
    expect(zoom().disabled).toBe(false);
    const least = screen.getByText(/^At least [\d.]+ \(the whole map's zoom\)$/).textContent ?? '';
    await user.type(zoom(), '0.1{Enter}');
    expect(map(store)?.camera).toEqual({ fit: ['births'] });
    expect(await screen.findByText(/^A zoom limit of 0\.1 would be ignored/)).toBeTruthy();
    const floor = Number(/At least ([\d.]+)/.exec(least)?.[1]);
    await user.clear(zoom());
    await user.type(zoom(), `${floor + 1}{Enter}`);
    expect(map(store)?.camera).toEqual({ fit: ['births'], maxZoom: floor + 1 });
    // Back to the whole map: the limit now does nothing, so it can be cleared, and only cleared.
    await user.click(screen.getByRole('button', { name: 'Whole map' }));
    expect(map(store)?.camera).toEqual({ maxZoom: floor + 1 });
    expect(zoom().disabled).toBe(false);
    expect(screen.getByText(/^No effect: the camera shows the whole map as it is/)).toBeTruthy();
    await user.clear(zoom());
    await user.type(zoom(), '3{Enter}');
    expect(map(store)?.camera).toEqual({ maxZoom: floor + 1 });
    expect(await screen.findByText(/^A zoom limit here would be ignored/)).toBeTruthy();
    await user.clear(zoom());
    await user.tab();
    expect(map(store)?.camera).toBeUndefined();
    expect(zoom().disabled).toBe(true);
  });

  it('keeps the zoom limit to the map as its links change, where the automatic layout places the variables', async () => {
    // Thirty variables in four categories, none placed: the automatic layout places them by their links too.
    const p = createProject({ title: 'Unplaced' });
    p.types.categories = [0, 1, 2, 3].map((i) => ({ id: `c${i}`, name: `C${i}` }));
    p.variables = Array.from({ length: 30 }, (_, i) => ({
      id: `v${i}`,
      label: `V${i}`,
      category: `c${i % 4}`,
      citations: [],
    }));
    p.links = Array.from({ length: 29 }, (_, i) => ({
      id: `L${i}`,
      from: `v${i}`,
      to: `v${i + 1}`,
      sign: '+' as const,
      citations: [],
    }));
    p.story.scenes = [
      {
        id: 'S1',
        title: 'All',
        sources: [],
        steps: [{ id: '1', label: 'One', map: { camera: { fit: ['v0'] } }, overlays: [] }],
      },
    ];
    const { store, user } = await openStory(p);
    const panel = within(screen.getByRole('complementary', { name: 'Story panel' }));
    await user.click(panel.getByRole('tab', { name: 'Map' }));
    // The least zoom the renderer's camera takes for this step (a limit far below it gives way to it).
    const least = () => {
      const nodes = mapGeometry(store.getState().project, { refineBends: false }).nodes;
      const positions = new Map([...nodes].map(([id, n]) => [id, { x: n.x, y: n.y }]));
      return fitCamera(positions, { fit: ['v0'], maxZoom: 0.01 }).zoom;
    };
    const shown = () =>
      Number(/^At least ([\d.]+)/.exec(screen.getByText(/^At least /).textContent ?? '')?.[1]);
    expect(shown()).toBe(Math.ceil(least() * 100) / 100);
    const before = least();
    act(() => {
      store.getState().edit((q) => addLink(q, { from: 'v0', to: 'v19', sign: '-' }));
    });
    // The new link moves the variables, and the whole map's zoom with them.
    expect(least()).toBeLessThan(before - 0.01);
    expect(shown()).toBe(Math.ceil(least() * 100) / 100);
    // A limit under the old floor but over the new one is taken.
    const between = Math.ceil(least() * 100) / 100;
    expect(between).toBeLessThan(before);
    const zoom = screen.getByRole('textbox', { name: 'Zoom at most' });
    await user.type(zoom, `${between}{Enter}`);
    expect(map(store)?.camera).toEqual({ fit: ['v0'], maxZoom: between });
  });

  it("shows and sets how often ambient pulses walk and how far, from the renderer's defaults", async () => {
    const project = small();
    const step = project.story.scenes[0]?.steps[0];
    if (step) step.map.ambient = { from: ['births'], tone: 'harm', hops: [3, 5] };
    const { store, user } = await openStory(project);
    const panel = within(screen.getByRole('complementary', { name: 'Story panel' }));
    await user.click(panel.getByRole('tab', { name: 'Map' }));
    await user.click(screen.getByRole('button', { name: 'Ambient pulses' }));
    const field = async (name: string) =>
      (await screen.findByRole('textbox', { name }, { timeout: 5000 })) as HTMLInputElement;
    // Links per walk as the step sets them; the time between walks left out, with what the renderer uses.
    expect((await field('Links per walk: from')).value).toBe('3');
    expect((await field('Links per walk: to')).value).toBe('5');
    const from = await field('Seconds between walks: from (s)');
    expect(from.value).toBe('');
    expect(from.placeholder).toBe('1.6');
    expect(screen.getByText('Left out: 1.6–3')).toBeTruthy();
    // Setting one end keeps the other at what was in effect.
    await user.type(from, '2{Enter}');
    expect(map(store)?.ambient).toEqual({ from: ['births'], tone: 'harm', hops: [3, 5], every: [2, 3] });
    // No time between walks is refused, at either end.
    for (const name of ['Seconds between walks: from (s)', 'Seconds between walks: to (s)']) {
      const end = await field(name);
      await user.clear(end);
      await user.type(end, '0{Enter}');
      expect(map(store)?.ambient?.every).toEqual([2, 3]);
    }
    expect(
      await screen.findAllByText('Seconds between walks: each end must be more than 0; got 0.'),
    ).toHaveLength(2);
    expect((await field('Seconds between walks: from (s)')).value).toBe('2');
    const to = await field('Links per walk: to');
    await user.clear(to);
    await user.type(to, '6{Enter}');
    expect(map(store)?.ambient?.hops).toEqual([3, 6]);
  });
});
