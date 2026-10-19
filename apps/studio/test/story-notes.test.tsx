// Notes, the script with its key marks, the story's checks and the preview, in jsdom.
import { createProject, type Project } from '@loopweft/model';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/app.tsx';
import { memoryRecovery } from '../src/state/recovery.ts';
import { createStudioStore, type StudioStore } from '../src/state/store.ts';

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
      targetSeconds: 30,
      sources: [],
      steps: [
        { id: '1', label: 'The map', at: 0, map: {}, overlays: [{ type: 'caption' }] },
        {
          id: '2',
          label: 'The link',
          at: 0.2,
          // Births rise, so population should rise too: this ▼ contradicts the + link.
          map: { links: { active: ['L1'] }, trends: { births: 'up', population: 'down' } },
          overlays: [],
        },
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
  const side = (name: string) =>
    user.click(within(screen.getByRole('complementary', { name: 'Story panel' })).getByRole('tab', { name }));
  return { store, user, side };
}

const scene = (store: StudioStore) => store.getState().project.story.scenes[0];

describe('notes and the script', () => {
  it('keeps notes and a script, inserts key marks, and shows the script beside its steps', async () => {
    const { store, user, side } = await openStory();
    await side('Notes');
    await user.type(screen.getByRole('textbox', { name: /^Speaker notes/ }), '- Say it slowly.');
    const script = screen.getByRole('textbox', { name: /^Script/ });
    await user.click(script);
    expect(scene(store)?.notes).toBe('- Say it slowly.');
    await user.type(script, 'Here is the map.');
    await user.click(screen.getByRole('button', { name: 'Insert a key mark [>]' }));
    await user.type(script, 'And the link.');
    await user.tab();
    // Two steps in the last scene need one mark.
    expect(scene(store)?.script).toBe('Here is the map. [>] And the link.');
    const parts = within(screen.getByRole('complementary', { name: 'Story panel' })).getAllByText(
      /S1\.\d · /,
    );
    expect(parts.map((p) => p.textContent)).toEqual(['S1.1 · The map', '▶ S1.2 · The link']);
    expect(screen.queryByText(/The script has/)).toBeNull();

    await user.type(script, ' [[>] More.');
    await user.tab();
    expect(screen.getByText(/The script has 2 key marks; its 2 steps need 1/)).toBeTruthy();
  });
});

describe('the checks', () => {
  it('lists the story’s warnings by step, marks them in the outline, and goes to the step', async () => {
    const { store, user, side } = await openStory();
    const outline = screen.getByRole('navigation', { name: 'Story outline' });
    expect(within(outline).getByRole('img', { name: '1 warning' })).toBeTruthy();
    await side('Checks');
    expect(screen.getByText('1 to look at')).toBeTruthy();
    expect(
      screen.getByText('population is marked down, but L1 (+) from births (up) implies up.'),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Show S1.2' }));
    expect(store.getState().story).toBe('S1.2');
  });
});

describe('the preview', () => {
  it('moves through the story with the arrow keys on the stage, and plays the scene at its times', async () => {
    const { store, user } = await openStory();
    const stage = screen.getByRole('region', { name: /^Stage/ });
    stage.focus();
    await user.keyboard('{ArrowRight}');
    expect(store.getState().story).toBe('S1.2');
    await user.keyboard('{ArrowLeft}');
    expect(store.getState().story).toBe('S1.1');
    await user.click(screen.getByRole('button', { name: 'Play into this step' }));

    await user.click(screen.getByRole('button', { name: 'Play the scene from here' }));
    expect(screen.getByText(/^Playing · S1\.1/)).toBeTruthy();
    // The record tools step aside while it plays.
    expect(screen.queryByRole('radiogroup', { name: 'Record tool' })).toBeNull();
    await waitFor(() => expect(store.getState().story).toBe('S1.2'), { timeout: 3000 });
    await user.click(screen.getByRole('button', { name: 'Stop playing' }));
    expect(screen.queryByText(/^Playing/)).toBeNull();
  });
});
