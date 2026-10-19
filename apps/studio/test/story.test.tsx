// The Story workspace in jsdom: the outline of scenes and steps, the stage showing the chosen step, and the
// panels that change a step and its scene. Every change is one of the model's operations, so it can be undone.
import { createProject, type Project } from '@loopweft/model';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/app.tsx';
import { memoryRecovery } from '../src/state/recovery.ts';
import { createStudioStore, type StudioStore } from '../src/state/store.ts';
import { example } from './helpers.ts';

/** A small map with a two-step story. */
function small(): Project {
  const p = createProject({ title: 'Small map' });
  p.variables = [
    { id: 'births', label: 'Births', citations: [] },
    { id: 'population', label: 'Population', citations: [] },
  ];
  p.links = [{ id: 'L1', from: 'births', to: 'population', sign: '+', citations: [] }];
  p.layout.positions = { births: { x: 300, y: 300 }, population: { x: 700, y: 300 } };
  p.story.scenes = [
    {
      id: 'S1',
      title: 'Growth',
      sources: [],
      steps: [
        { id: '1', label: 'The map', map: {}, overlays: [{ type: 'caption' }] },
        { id: '2', label: 'The link', map: { links: { base: 'dim', active: ['L1'] } }, overlays: [] },
      ],
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

const outline = () => screen.getByRole('navigation', { name: 'Story outline' });

describe('the Story workspace', () => {
  it('lists the scenes and steps, shows the first step on the stage, and moves between steps', async () => {
    const { store, user } = await openStory();
    const nav = outline();
    expect(within(nav).getByText('1 scene, 2 steps')).toBeTruthy();
    expect(
      within(nav)
        .getByRole('button', { name: /S1\.1\s*The map/ })
        .getAttribute('aria-current'),
    ).toBe('step');
    expect(screen.getByText('S1.1 · The map · step 1 of 2')).toBeTruthy();
    // The stage draws the step: its caption carries the scene's title.
    const stage = screen.getByTestId('story-stage');
    expect(stage.querySelector('.lw-viewport')).toBeTruthy();
    expect(stage.textContent).toContain('Growth');

    await user.click(screen.getByRole('button', { name: 'Next step' }));
    expect(store.getState().story).toBe('S1.2');
    expect(screen.getByText('S1.2 · The link · step 2 of 2')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Next step' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(within(nav).getByRole('button', { name: /S1\.1\s*The map/ }));
    expect(store.getState().story).toBe('S1.1');
  });

  it('adds a scene and its steps: a copy of the chosen step, or the whole map', async () => {
    const { store, user } = await openStory();
    await user.click(screen.getByRole('button', { name: 'Scene' }));
    await user.type(screen.getByRole('textbox', { name: 'Title of the new scene' }), 'Limits{Enter}');
    expect(store.getState().project.story.scenes.map((s) => s.id)).toEqual(['S1', 'S2']);
    expect(store.getState().story).toBe('S2');

    await user.click(screen.getByRole('button', { name: 'Add a step to scene S2' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Label of the new step in scene S2' }),
      'Opening{Enter}',
    );
    expect(store.getState().project.story.scenes[1]?.steps[0]).toEqual({
      id: '1',
      label: 'Opening',
      map: {},
      overlays: [],
    });
    expect(store.getState().story).toBe('S2.1');

    // In scene S1, with S1.2 chosen, a new step starts as a copy of it and goes after it.
    await user.click(within(outline()).getByRole('button', { name: /S1\.2\s*The link/ }));
    await user.click(screen.getByRole('button', { name: 'Add a step to scene S1' }));
    expect(screen.getByRole('radio', { name: 'A copy of S1.2' })).toBeTruthy();
    await user.type(
      screen.getByRole('textbox', { name: 'Label of the new step in scene S1' }),
      'Again{Enter}',
    );
    const copied = store.getState().project.story.scenes[0]?.steps[2];
    expect(copied).toEqual({
      id: '3',
      label: 'Again',
      map: { links: { base: 'dim', active: ['L1'] } },
      overlays: [],
    });
    expect(store.getState().past.at(-1)?.label).toBe('Copied step S1.2 as S1.3 ("Again").');
  });

  it('changes a step and its scene from the side panel', async () => {
    const { store, user } = await openStory();
    const label = screen.getByRole('textbox', { name: /^Label/ });
    await user.clear(label);
    await user.type(label, 'The whole map{Enter}');
    expect(store.getState().project.story.scenes[0]?.steps[0]?.label).toBe('The whole map');
    await user.type(screen.getByRole('textbox', { name: /^Due at/ }), '5{Enter}');
    expect(store.getState().project.story.scenes[0]?.steps[0]?.at).toBe(5);

    await user.click(screen.getByRole('tab', { name: 'Scene' }));
    await user.type(screen.getByRole('textbox', { name: /^Headline/ }), 'Births feed the population.{Enter}');
    await user.type(screen.getByRole('textbox', { name: /^Target time/ }), '60{Enter}');
    const scene = store.getState().project.story.scenes[0];
    expect(scene?.headline).toBe('Births feed the population.');
    expect(scene?.targetSeconds).toBe(60);
    expect(within(outline()).getByText('S1 · 2 steps · 1 min')).toBeTruthy();
    // The stage's caption shows the new headline.
    expect(screen.getByTestId('story-stage').textContent).toContain('Births feed the population.');
    store.getState().undo();
    store.getState().undo();
    expect(store.getState().project.story.scenes[0]?.headline).toBeUndefined();
  });

  it('copies, moves and removes steps and scenes from their menus', async () => {
    const { store, user } = await openStory();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Step S1.1: more' }));
    await user.click(screen.getByRole('menuitem', { name: 'Move down' }));
    expect(store.getState().project.story.scenes[0]?.steps.map((s) => s.id)).toEqual(['2', '1']);
    await user.click(screen.getByRole('button', { name: 'Step S1.1: more' }));
    await user.click(screen.getByRole('menuitem', { name: 'Copy this step…' }));
    await user.type(screen.getByRole('textbox', { name: 'Label of the copy of S1.1' }), 'Copy{Enter}');
    expect(store.getState().project.story.scenes[0]?.steps.map((s) => s.label)).toEqual([
      'The link',
      'The map',
      'Copy',
    ]);
    await user.click(screen.getByRole('button', { name: 'Step S1.3: more' }));
    await user.click(screen.getByRole('menuitem', { name: 'Remove step' }));
    expect(window.confirm).toHaveBeenCalledWith('Remove step S1.3 ("Copy")?');
    expect(store.getState().project.story.scenes[0]?.steps).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Scene S1: more' }));
    await user.click(screen.getByRole('menuitem', { name: 'Remove scene' }));
    expect(window.confirm).toHaveBeenLastCalledWith('Remove scene S1 ("Growth") and its 2 steps?');
    expect(store.getState().project.story.scenes).toEqual([]);
    expect(within(outline()).getByText(/No story yet/)).toBeTruthy();
  });

  it('removes the images only the removed steps showed, with them, as one undoable step', async () => {
    const project = small();
    // A 1×1 PNG, shown on both steps.
    project.assets = {
      chart:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    };
    for (const step of project.story.scenes[0]?.steps ?? [])
      step.overlays.push({ type: 'image', asset: 'chart', alt: 'A test image' });
    const { store, user } = await openStory(project);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    // Step S1.1 still shows the image, so it stays.
    await user.click(screen.getByRole('button', { name: 'Step S1.2: more' }));
    await user.click(screen.getByRole('menuitem', { name: 'Remove step' }));
    expect(store.getState().project.story.scenes[0]?.steps).toHaveLength(1);
    expect(Object.keys(store.getState().project.assets)).toEqual(['chart']);
    // With the scene goes the last step that showed it, and so the image.
    await user.click(screen.getByRole('button', { name: 'Scene S1: more' }));
    await user.click(screen.getByRole('menuitem', { name: 'Remove scene' }));
    expect(store.getState().project.story.scenes).toEqual([]);
    expect(store.getState().project.assets).toEqual({});
    expect(store.getState().past.at(-1)?.label).toBe(
      'Removed scene S1 ("Growth") and its 1 step, with image chart, which no other step shows.',
    );
    store.getState().undo();
    expect(store.getState().project.story.scenes[0]?.steps).toHaveLength(1);
    expect(Object.keys(store.getState().project.assets)).toEqual(['chart']);
  });

  it('opens the polycrisis example’s story', async () => {
    await openStory(example());
    expect(within(outline()).getByText('11 scenes, 70 steps')).toBeTruthy();
    expect(screen.getByText('S00.1 · Title page · step 1 of 70')).toBeTruthy();
    expect(screen.getByTestId('story-stage').textContent).toContain('Global Polycrisis');
  });
});
