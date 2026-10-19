// The Overlays panel in jsdom: adding each kind of overlay (asking first for what it cannot do without),
// changing, ordering, copying forward and removing them, embedding an image, and citing a source.
import { createProject, type Project } from '@loopweft/model';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/app.tsx';
import { memoryRecovery } from '../src/state/recovery.ts';
import { createStudioStore, type StudioStore } from '../src/state/store.ts';

/** A 1×1 PNG. */
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function small(): Project {
  const p = createProject({ title: 'Small map' });
  p.variables = [
    { id: 'births', label: 'Births', citations: [] },
    { id: 'population', label: 'Population', citations: [] },
  ];
  p.links = [{ id: 'L1', from: 'births', to: 'population', sign: '+', citations: [] }];
  p.layout.positions = { births: { x: 300, y: 300 }, population: { x: 700, y: 300 } };
  p.sources = [
    { id: 'T', label: 'Test (2020)', apa: 'Test, A. (2020). *A fictitious source for tests*. Test Press.' },
  ];
  p.story.scenes = [
    {
      id: 'S1',
      title: 'Growth',
      sources: [],
      steps: [
        { id: '1', label: 'One', map: {}, overlays: [] },
        { id: '2', label: 'Two', map: {}, overlays: [] },
        { id: '3', label: 'Three', map: {}, overlays: [{ type: 'caption' }] },
      ],
    },
  ];
  return p;
}

async function openOverlays(project: Project = small()) {
  const store: StudioStore = createStudioStore(project, { name: 'small.loopweft' });
  render(<App store={store} recovery={memoryRecovery()} env="test" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('tab', { name: 'Story' }));
  await user.click(
    within(screen.getByRole('complementary', { name: 'Story panel' })).getByRole('tab', { name: 'Overlays' }),
  );
  return { store, user };
}

const overlays = (store: StudioStore, step = 0) =>
  store.getState().project.story.scenes[0]?.steps[step]?.overlays;
const add = async (user: ReturnType<typeof userEvent.setup>, kind: string) => {
  await user.click(screen.getByRole('button', { name: 'Add' }));
  await user.click(screen.getByRole('menuitem', { name: kind }));
};

describe('the Overlays panel', () => {
  it('adds a caption and a legend at once, and the rest once given what they need', async () => {
    const { store, user } = await openOverlays();
    await add(user, 'Caption');
    await add(user, 'Legend');
    await add(user, 'Statement');
    const addButton = () => screen.getAllByRole('button', { name: 'Add' }).at(-1) as HTMLButtonElement;
    expect(addButton().disabled).toBe(true);
    await user.type(
      screen.getByRole('textbox', { name: 'Lines (one per line)' }),
      'Why now?{Enter}{Enter}Two reasons.',
    );
    await user.click(addButton());
    await add(user, 'Cards');
    await user.type(screen.getByRole('textbox', { name: "First card's title" }), 'Interrupt transmission');
    await user.click(addButton());
    expect(overlays(store)).toEqual([
      { type: 'caption' },
      { type: 'legend' },
      { type: 'statement', lines: ['Why now?', 'Two reasons.'] },
      { type: 'cards', items: [{ title: 'Interrupt transmission' }] },
    ]);
    // A step shows the caption at most once.
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('menuitem', { name: 'Caption (shown)' }).hasAttribute('data-disabled')).toBe(
      true,
    );
  });

  it('changes a statement and cards, cites a source, and orders, copies and removes overlays', async () => {
    const { store, user } = await openOverlays();
    await add(user, 'Statement');
    await user.type(screen.getByRole('textbox', { name: 'Lines (one per line)' }), 'A question?');
    await user.click(screen.getAllByRole('button', { name: 'Add' }).at(-1) as HTMLButtonElement);
    await user.type(screen.getByRole('textbox', { name: /^Kicker/ }), 'INTERVENTION A{Enter}');
    await user.click(screen.getByRole('combobox', { name: 'Source to cite' }));
    await user.click(screen.getByRole('option', { name: /Test \(2020\)/ }));
    await user.type(screen.getByRole('textbox', { name: 'Pages' }), '4');
    await user.click(screen.getByRole('button', { name: 'Cite' }));
    expect(overlays(store)?.[0]).toEqual({
      type: 'statement',
      lines: ['A question?'],
      kicker: 'INTERVENTION A',
      citations: [{ source: 'T', pages: '4' }],
    });

    await add(user, 'Cards');
    await user.type(screen.getByRole('textbox', { name: "First card's title" }), 'One');
    await user.click(screen.getAllByRole('button', { name: 'Add' }).at(-1) as HTMLButtonElement);
    await user.type(screen.getByRole('textbox', { name: "New card's title" }), 'Two{Enter}');
    await user.click(screen.getByRole('checkbox', { name: 'Card 2 highlighted' }));
    expect(overlays(store)?.[1]).toEqual({
      type: 'cards',
      items: [{ title: 'One' }, { title: 'Two' }],
      active: [1],
    });
    await user.click(screen.getByRole('button', { name: 'Remove card 1' }));
    expect(overlays(store)?.[1]).toEqual({ type: 'cards', items: [{ title: 'Two' }], active: [0] });

    await user.click(screen.getByRole('button', { name: 'Move overlay 2 under' }));
    expect(overlays(store)?.map((o) => o.type)).toEqual(['cards', 'statement']);
    await user.click(screen.getByRole('button', { name: 'Copy overlay 2 to the following steps' }));
    expect(overlays(store, 1)?.map((o) => o.type)).toEqual(['statement']);
    expect(overlays(store, 2)?.map((o) => o.type)).toEqual(['caption', 'statement']);
    expect(store.getState().past.at(-1)?.label).toBe('Copied the statement of step S1.1 to 2 later steps.');
    await user.click(screen.getByRole('button', { name: 'Remove overlay 1' }));
    expect(overlays(store)?.map((o) => o.type)).toEqual(['statement']);
  });

  it('embeds an image with its description, and removes it with its last overlay', async () => {
    const { store, user } = await openOverlays();
    await add(user, 'Image');
    const file = new File([Uint8Array.from(atob(PNG), (c) => c.charCodeAt(0))], 'Fig 5.png', {
      type: 'image/png',
    });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);
    expect(screen.getByRole('button', { name: 'Image: Fig 5.png' })).toBeTruthy();
    await user.type(screen.getByRole('textbox', { name: /^Description \(alt text\)/ }), 'A tiny test image');
    await user.click(screen.getAllByRole('button', { name: 'Add' }).at(-1) as HTMLButtonElement);
    await screen.findByText('Image fig_5');
    expect(overlays(store)).toEqual([{ type: 'image', asset: 'fig_5', alt: 'A tiny test image' }]);
    expect(store.getState().project.assets.fig_5).toBe(`data:image/png;base64,${PNG}`);
    expect(store.getState().past.at(-1)?.label).toBe('Step S1.1: added an image (fig_5).');

    await user.click(screen.getByRole('button', { name: 'Remove overlay 1' }));
    expect(overlays(store)).toEqual([]);
    expect(store.getState().project.assets).toEqual({});
    store.getState().undo();
    expect(store.getState().project.assets.fig_5).toBeTruthy();
  });
});
