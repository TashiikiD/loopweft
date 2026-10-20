import { createProject, type Project } from '@loopweft/model';
import { SLOT } from '@loopweft/player';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/app.tsx';
import { StudioContext } from '../src/context.tsx';
import { ExportWorkspace } from '../src/export/workspace.tsx';
import { Providers } from '../src/providers.tsx';
import { memoryRecovery } from '../src/state/recovery.ts';
import { createStudioStore, type StudioStore } from '../src/state/store.ts';

/** A small map with a two-step story, notes on its scene and a cue on its first step. */
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
      notes: '- Say why births matter.',
      sources: [],
      steps: [
        { id: '1', label: 'The map', cue: 'Show the map.', map: {}, overlays: [{ type: 'caption' }] },
        { id: '2', label: 'The link', map: { links: { base: 'dim', active: ['L1'] } }, overlays: [] },
      ],
    },
  ];
  return p;
}

async function open(tab: 'Present' | 'Export', project: Project = small()) {
  const store: StudioStore = createStudioStore(project, { name: 'small.loopweft' });
  render(<App store={store} recovery={memoryRecovery()} env="test" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('tab', { name: tab }));
  return { store, user };
}

afterEach(() => {
  localStorage.clear();
  document.body.replaceChildren();
});

describe('the Present workspace', () => {
  it('says what the story holds and offers the console and a rehearsal', async () => {
    await open('Present');
    expect(screen.getByText('1 scene · 2 steps · 0:30 in all')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open the console' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rehearse' })).toBeTruthy();
    expect(screen.queryByText(/saved a place/)).toBeNull();
  });

  it('opens the console over the Studio, on a copy of the map, and comes back', async () => {
    const { user } = await open('Present');
    await user.click(screen.getByRole('button', { name: 'Open the console' }));
    const console_ = screen.getByRole('dialog', { name: 'Presenter console' });
    // The keys go to the console, not to the button that opened it (Space would press it again).
    expect(document.activeElement).toBe(console_);
    expect(within(console_).getByText('Growth')).toBeTruthy();
    expect(console_.querySelector('.lp-scene-sub')?.textContent).toBe('Step 1 of 2 · S1.1 · The map');
    await user.keyboard('{PageDown}');
    expect(console_.querySelector('.lp-scene-sub')?.textContent).toBe('Step 2 of 2 · S1.2 · The link');
    await user.click(within(console_).getByRole('button', { name: 'Back to the Studio' }));
    expect(screen.queryByRole('dialog', { name: 'Presenter console' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open the console' }));
    // The place it reached stays saved, with a way back to the start.
    expect(screen.getByText('This browser saved a place from an earlier run')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Start again from the first step' }));
    expect(screen.queryByText('This browser saved a place from an earlier run')).toBeNull();
  });

  it('is a modal: the Studio behind is out of reach, Tab stays inside, and all comes back on closing', async () => {
    const { user } = await open('Present');
    const opener = screen.getByRole('button', { name: 'Open the console' });
    await user.click(opener);
    const console_ = screen.getByRole('dialog', { name: 'Presenter console' });
    const behind = [...document.body.children].filter((el) => !el.contains(console_));
    expect(behind.length).toBeGreaterThan(0);
    expect(behind.every((el) => el.hasAttribute('inert'))).toBe(true);
    // Shift+Tab from the console itself goes to its last control, and Tab from there back to its first.
    const controls = [...console_.querySelectorAll<HTMLElement>('button, a[href]')].filter(
      (el) => !el.closest('[hidden], dialog:not([open])'),
    );
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(controls.at(-1));
    await user.tab();
    expect(document.activeElement).toBe(controls[0]);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(controls.at(-1));
    await user.click(within(console_).getByRole('button', { name: 'Back to the Studio' }));
    expect(behind.some((el) => el.hasAttribute('inert'))).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('rehearses in one window, and Esc comes back', async () => {
    const { user } = await open('Present');
    await user.click(screen.getByRole('button', { name: 'Rehearse' }));
    const rehearsal = screen.getByRole('dialog', { name: 'Rehearsal' });
    await user.keyboard('n');
    expect(rehearsal.querySelector('.lp-rehearsal h2')?.textContent).toBe('Scene 01 · step 1 of 2');
    await user.keyboard('{PageDown}');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Rehearsal' })).toBeNull();
    // The Studio's page keeps its own background.
    expect(document.body.style.background).toBe('');
    // The rehearsal kept its own place: the talk has none, and the rehearsal picks up where it stopped.
    expect(screen.queryByText('This browser saved a place from an earlier run')).toBeNull();
    expect(screen.getByText(/^It picks up at S1\.2, where the last rehearsal stopped/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Rehearse' }));
    await user.keyboard('n');
    expect(
      screen.getByRole('dialog', { name: 'Rehearsal' }).querySelector('.lp-rehearsal h2')?.textContent,
    ).toBe('Scene 01 · step 2 of 2');
    await user.keyboard('n');
    await user.keyboard('{Escape}');
  });

  it('sends a story without steps to the Story workspace', async () => {
    const { user, store } = await open('Present', createProject({ title: 'Empty' }));
    expect(screen.getByText(/no story to present yet/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Go to the Story workspace' }));
    expect(store.getState().workspace).toBe('story');
  });
});

describe('the Export workspace', () => {
  it('asks where to save in the click itself, before the page is made, and writes it there', async () => {
    const store = createStudioStore(small(), { name: 'small.loopweft' });
    let loaded = false;
    let release = () => {};
    const template = () =>
      new Promise<string>((resolve) => {
        release = () => {
          loaded = true;
          resolve(`<title>t</title>${SLOT}`);
        };
      });
    const written: string[] = [];
    const asked: boolean[] = [];
    const picker = vi.fn(async () => {
      asked.push(loaded);
      return {
        name: 'chosen.html',
        createWritable: async () => ({
          write: async (text: string) => {
            written.push(text);
          },
          close: async () => {},
        }),
      };
    });
    const w = window as unknown as Record<string, unknown>;
    w.showSaveFilePicker = picker;
    try {
      render(
        <Providers env="test">
          <StudioContext.Provider value={store}>
            <ExportWorkspace template={template} />
          </StudioContext.Provider>
        </Providers>,
      );
      const user = userEvent.setup();
      await act(() => user.click(screen.getByRole('button', { name: 'Export HTML…' })));
      // The dialog was asked for while the page was still loading.
      expect(asked).toEqual([false]);
      expect(written).toEqual([]);
      await act(async () => release());
      expect(await screen.findByText(/^Last export: 0\.0 MB, speaker notes included\./)).toBeTruthy();
      expect(written).toHaveLength(1);
      expect(written[0]).toContain('data-notes="included"');
    } finally {
      delete w.showSaveFilePicker;
    }
  });

  it('says which of the presenter’s words the copy holds, and exports the page with or without them', async () => {
    const store = createStudioStore(small(), { name: 'small.loopweft' });
    const saved: string[] = [];
    const create = vi.fn(() => 'blob:x');
    URL.createObjectURL = create;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download);
    });
    render(
      <Providers env="test">
        <StudioContext.Provider value={store}>
          <ExportWorkspace template={async () => `<title>t</title>${SLOT}`} />
        </StudioContext.Provider>
      </Providers>,
    );
    const user = userEvent.setup();
    expect(screen.getByText(/This copy includes the speaker notes and each step’s cue\./)).toBeTruthy();
    await act(() => user.click(screen.getByRole('button', { name: 'Export HTML…' })));
    expect(saved).toEqual(['small-map.html']);
    expect(await screen.findByText(/^Last export: 0\.0 MB, speaker notes included\./)).toBeTruthy();
    await user.click(screen.getByLabelText('Include the speaker notes, the script and the cues'));
    await act(() => user.click(screen.getByRole('button', { name: 'Export HTML…' })));
    expect(await screen.findByText(/^Last export: 0\.0 MB, speaker notes left out\./)).toBeTruthy();
    const blobs = (create.mock.calls as unknown as Blob[][]).map((c) => c[0] as Blob);
    expect(await blobs[0]?.text()).toContain('data-notes="included"');
    expect(await blobs[1]?.text()).toContain('data-notes="left-out"');
    vi.restoreAllMocks();
  });
});
