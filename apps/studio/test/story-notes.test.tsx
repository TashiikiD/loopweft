// Notes, the script with its key marks, the story's checks and the preview, in jsdom.
import { createProject, moveStep, type Project, type Step, setStep } from '@loopweft/model';
import { playTimes } from '@loopweft/player';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/app.tsx';
import { memoryRecovery } from '../src/state/recovery.ts';
import { createStudioStore, type StudioStore } from '../src/state/store.ts';

afterEach(() => {
  vi.useRealTimers();
});

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
          // Due a second in: long enough that a click on a busy computer still finds the scene at its first step.
          at: 1,
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
    // Past the insert button, which keeps the draft while it has focus.
    await user.tab();
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
    await user.tab();
    expect(screen.getByText(/The script has 2 key marks; its 2 steps need 1/)).toBeTruthy();
  });

  it('puts the cursor after a key mark at once, so a key typed straight after it goes there', async () => {
    // A key that comes before the next frame (a quick typist, a busy computer): frames are held back here, so
    // nothing may wait for one. (The cursor used to be put back on the next frame, after such a key had gone in
    // at the end: "[>] nd the link.A", seen on CI's Mac.)
    const frames: FrameRequestCallback[] = [];
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    try {
      const { user, side } = await openStory();
      await side('Notes');
      const script = screen.getByRole('textbox', { name: /^Script/ }) as HTMLTextAreaElement;
      await user.click(script);
      await user.type(script, 'Alpha beta');
      // In the middle of the text, where setting the field's text would leave the cursor at the end.
      script.setSelectionRange(5, 5);
      await user.click(screen.getByRole('button', { name: 'Insert a key mark [>]' }));
      expect(script.selectionStart).toBe('Alpha [>]'.length);
      await user.keyboard('X');
      for (const frame of frames.splice(0)) frame(0);
      await user.keyboard('Y');
      expect(script.value).toBe('Alpha [>]XY beta');
    } finally {
      raf.mockRestore();
    }
  });

  it('puts a key mark where the cursor was when the button is pressed from the keyboard, as one change', async () => {
    const { store, user, side } = await openStory();
    await side('Notes');
    const script = screen.getByRole('textbox', { name: /^Script/ }) as HTMLTextAreaElement;
    const insert = screen.getByRole('button', { name: 'Insert a key mark [>]' });
    await user.click(script);
    await user.type(script, 'Alpha beta gamma');
    const changes = store.getState().past.length;
    // A cursor after "Alpha": Tab to the button, Enter.
    script.setSelectionRange(5, 5);
    await user.tab();
    expect(document.activeElement).toBe(insert);
    await user.keyboard('{Enter}');
    expect(script.value).toBe('Alpha [>] beta gamma');
    expect(document.activeElement).toBe(script);
    await waitFor(() => expect(script.selectionStart).toBe('Alpha [>]'.length));
    // "gamma" selected: the mark takes its place.
    script.setSelectionRange(15, 20);
    await user.tab();
    await user.keyboard(' ');
    expect(script.value).toBe('Alpha [>] beta [>] ');
    // Leaving the field keeps it all, as one undoable change.
    await user.click(screen.getByRole('textbox', { name: /^Speaker notes/ }));
    expect(scene(store)?.script).toBe('Alpha [>] beta [>]');
    expect(store.getState().past.length).toBe(changes + 1);
  });

  it('names each Show button by the step it shows', async () => {
    const project = small();
    const first = project.story.scenes[0];
    if (first) {
      first.steps.push({ id: '3', label: 'More', map: {}, overlays: [] });
      first.script = 'One. [>] Two. [>] Three. [>] Four. [>] Five.';
    }
    const errors = vi.spyOn(console, 'error');
    const { side } = await openStory(project);
    await side('Notes');
    expect(screen.getByRole('button', { name: 'Show step S1.2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show step S1.3' })).toBeTruthy();
    // Two marks too many: two parts after the last step, each with a key of its own.
    expect(screen.getAllByText('▶ After the last step')).toHaveLength(2);
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/two children with the same key/);
    errors.mockRestore();
  });
});

describe('the checks', () => {
  it('lists an image no step shows before the story has a scene', async () => {
    const project = small();
    project.story.scenes = [];
    project.assets = {
      chart:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    };
    const { side } = await openStory(project);
    await side('Checks');
    expect(screen.getByText('Image chart is not shown on any step.')).toBeTruthy();
    await side('Step');
    expect(screen.getByText('Add a scene to start the story.')).toBeTruthy();
  });

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

    // The scene plays on a clock the test moves, so a busy computer cannot skip a step.
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Play the scene from here' }));
    expect(screen.getByText(/^Playing · S1\.1/)).toBeTruthy();
    // The record tools step aside while it plays.
    expect(screen.queryByRole('radiogroup', { name: 'Record tool' })).toBeNull();
    act(() => vi.advanceTimersByTime(999));
    expect(store.getState().story).toBe('S1.1');
    act(() => vi.advanceTimersByTime(1));
    expect(store.getState().story).toBe('S1.2');
    fireEvent.click(screen.getByRole('button', { name: 'Stop playing' }));
    expect(screen.queryByText(/^Playing/)).toBeNull();
  });

  /** A scene of five steps: untimed, due at 20 s, untimed, then two due at 30 s. */
  function timed(): Project {
    const p = small();
    const steps: Step[] = [
      { id: '1', label: 'Untimed', map: {}, overlays: [] },
      { id: '2', label: 'At 20', at: 20, map: {}, overlays: [] },
      { id: '3', label: 'Untimed again', map: {}, overlays: [] },
      { id: '4', label: 'At 30', at: 30, map: {}, overlays: [] },
      { id: '5', label: 'Also at 30', at: 30, map: {}, overlays: [] },
    ];
    p.story.scenes = [{ id: 'S1', title: 'Timed', targetSeconds: 40, sources: [], steps }];
    return p;
  }

  /** Plays the scene from `key`, on a clock the test moves. */
  async function playFrom(project: Project, key: string) {
    const opened = await openStory(project);
    act(() => opened.store.getState().selectStory(key));
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Play the scene from here' }));
    const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));
    return { ...opened, wait, at: () => opened.store.getState().story };
  }

  it('brings each step up when it is due: after an untimed step, at equal times, and from a later step', () => {
    expect(playTimes(timed().story.scenes[0]?.steps ?? [])).toEqual([0, 20, 24, 30, 30]);
    // Due before the step before (the checks flag that): at once.
    expect(playTimes([{ at: 10 }, { at: 3 }, {}])).toEqual([10, 10, 14]);
  });

  it('plays a step due at 20 s at 20 s, though the step before is untimed, and equal times at once', async () => {
    const { wait, at } = await playFrom(timed(), 'S1.1');
    wait(4000);
    expect(at()).toBe('S1.1');
    wait(16000);
    expect(at()).toBe('S1.2');
    // Untimed: the hold.
    wait(4000);
    expect(at()).toBe('S1.3');
    // Due at 30 s, six seconds after the untimed step came up at 24 s.
    wait(5999);
    expect(at()).toBe('S1.3');
    wait(1);
    expect(at()).toBe('S1.4');
    // Due at the same time: at once (on the timer's next turn, a millisecond on this clock), not after the hold.
    wait(1);
    expect(at()).toBe('S1.5');
  });

  it('times a scene played from a later, untimed step from where that step comes in the scene', async () => {
    const { wait, at } = await playFrom(timed(), 'S1.3');
    wait(5999);
    expect(at()).toBe('S1.3');
    wait(1);
    expect(at()).toBe('S1.4');
  });

  it('stops playing when another step is chosen', async () => {
    const { wait, at } = await playFrom(timed(), 'S1.1');
    expect(screen.getByText(/^Playing · S1\.1/)).toBeTruthy();
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Story outline' })).getByRole('button', {
        name: /S1\.3\s*Untimed again/,
      }),
    );
    expect(screen.queryByText(/^Playing/)).toBeNull();
    wait(60000);
    expect(at()).toBe('S1.3');
    // And with Next, while playing.
    fireEvent.click(screen.getByRole('button', { name: 'Play the scene from here' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    expect(at()).toBe('S1.4');
    expect(screen.queryByText(/^Playing/)).toBeNull();
    wait(60000);
    expect(at()).toBe('S1.4');
  });

  it('stops playing when an edit changes the scene, though the chosen step keeps its key', async () => {
    const { store, wait, at } = await playFrom(timed(), 'S1.1');
    expect(screen.getByText(/^Playing · S1\.1/)).toBeTruthy();
    // S1.1 moved after S1.2: still S1.1, but the step that follows it is now S1.3.
    act(() => {
      store.getState().edit((p) => moveStep(p, 'S1.1', { after: '2' }));
    });
    expect(store.getState().project.story.scenes[0]?.steps.map((s) => s.id)).toEqual([
      '2',
      '1',
      '3',
      '4',
      '5',
    ]);
    expect(at()).toBe('S1.1');
    expect(screen.queryByText(/^Playing/)).toBeNull();
    // The old schedule (S1.2 at 20 s) brings nothing up.
    wait(60000);
    expect(at()).toBe('S1.1');
    // And a time changed while it plays.
    fireEvent.click(screen.getByRole('button', { name: 'Play the scene from here' }));
    expect(screen.getByText(/^Playing · S1\.1/)).toBeTruthy();
    act(() => {
      store.getState().edit((p) => setStep(p, 'S1.3', { at: 5 }));
    });
    expect(screen.queryByText(/^Playing/)).toBeNull();
    wait(60000);
    expect(at()).toBe('S1.1');
  });

  it("does not jump to the story's first step from a later scene's heading", async () => {
    const project = small();
    project.story.scenes.push({
      id: 'S2',
      title: 'Later',
      sources: [],
      steps: [{ id: '1', label: 'Later step', map: {}, overlays: [] }],
    });
    const { store, user } = await openStory(project);
    act(() => store.getState().selectStory('S2'));
    screen.getByRole('region', { name: /^Stage/ }).focus();
    await user.keyboard('{ArrowRight}');
    expect(store.getState().story).toBe('S2');
    await user.keyboard('{ArrowLeft}');
    expect(store.getState().story).toBe('S2');
  });
});
