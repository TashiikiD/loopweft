// The Overlays panel in jsdom: adding each kind of overlay (asking first for what it cannot do without),
// changing, ordering, copying forward and removing them, embedding an image, and citing a source.
import {
  addAsset,
  addOverlay,
  createProject,
  type Overlay,
  type Project,
  readProject,
  serializeProject,
  setStep,
} from '@loopweft/model';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
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

async function openOverlays(project: Project = small(), options: { strict?: boolean } = {}) {
  const store: StudioStore = createStudioStore(project, { name: 'small.loopweft' });
  const app = <App store={store} recovery={memoryRecovery()} env="test" />;
  // StrictMode: React mounts each component twice, as in development (the Studio's dev server).
  render(options.strict ? <StrictMode>{app}</StrictMode> : app);
  const user = userEvent.setup();
  await user.click(screen.getByRole('tab', { name: 'Story' }));
  await user.click(
    within(screen.getByRole('complementary', { name: 'Story panel' })).getByRole('tab', { name: 'Overlays' }),
  );
  return { store, user };
}

/** An image file whose bytes arrive only when `release` is called, as a slow disk or a large file would. */
function slowFile(name = 'slow.png') {
  const bytes = Uint8Array.from(atob(PNG), (c) => c.charCodeAt(0));
  const file = new File([bytes], name, { type: 'image/png' });
  let release: () => void = () => {};
  const ready = new Promise<ArrayBuffer>((resolve) => {
    release = () => resolve(bytes.slice().buffer);
  });
  Object.defineProperty(file, 'arrayBuffer', { value: () => ready });
  return { file, release: () => release() };
}

/** Lets a released read finish and its edit (if any) land. */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

/** A small SVG image, unlike the PNG. */
const SVG = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>')}`;

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
    await user.type(screen.getByRole('textbox', { name: 'Pages to cite' }), '4');
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
  it('adds no image when the Add is cancelled, or another project opened, while the file is read', async () => {
    const { store, user } = await openOverlays();
    const addButton = () => screen.getAllByRole('button', { name: 'Add' }).at(-1) as HTMLButtonElement;
    const start = async (file: File) => {
      await add(user, 'Image');
      await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file);
      await user.type(screen.getByRole('textbox', { name: 'Description (alt text)' }), 'A chart');
      await user.click(addButton());
    };
    // Cancelled while the file is read.
    const first = slowFile();
    await start(first.file);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    first.release();
    await settle();
    expect(overlays(store)).toEqual([]);
    expect(store.getState().project.assets).toEqual({});
    // Another project opened while the file is read: its own step S1.1 is left as it was.
    const second = slowFile();
    await start(second.file);
    const other = small();
    other.meta.title = 'Another map';
    act(() => store.getState().open(other, { name: 'other.loopweft' }));
    second.release();
    await settle();
    expect(store.getState().project.meta.title).toBe('Another map');
    expect(overlays(store)).toEqual([]);
    expect(store.getState().project.assets).toEqual({});
  });

  it('adds an image when React mounts the form twice, as it does in development', async () => {
    const { store, user } = await openOverlays(small(), { strict: true });
    await add(user, 'Image');
    const file = new File([Uint8Array.from(atob(PNG), (c) => c.charCodeAt(0))], 'chart.png', {
      type: 'image/png',
    });
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file);
    await user.type(screen.getByRole('textbox', { name: 'Description (alt text)' }), 'A chart');
    await user.click(screen.getAllByRole('button', { name: 'Add' }).at(-1) as HTMLButtonElement);
    await settle();
    expect(overlays(store)).toEqual([{ type: 'image', asset: 'chart', alt: 'A chart' }]);
  });

  it('replaces no image in a project opened while the new file is read', async () => {
    const project = small();
    project.assets = { chart: `data:image/png;base64,${PNG}` };
    project.story.scenes[0]?.steps[0]?.overlays.push({ type: 'image', asset: 'chart', alt: 'A chart' });
    const { store, user } = await openOverlays(project);
    const slow = slowFile();
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, slow.file);
    const other = small();
    other.assets = { chart: SVG };
    other.story.scenes[0]?.steps[0]?.overlays.push({ type: 'image', asset: 'chart', alt: 'Another chart' });
    act(() => store.getState().open(other, { name: 'other.loopweft' }));
    slow.release();
    await settle();
    expect(store.getState().project.assets).toEqual({ chart: SVG });
  });

  it('adds no image when another kind of overlay is chosen while the file is read, and keeps that form', async () => {
    const { store, user } = await openOverlays();
    await add(user, 'Image');
    const slow = slowFile();
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, slow.file);
    await user.type(screen.getByRole('textbox', { name: 'Description (alt text)' }), 'A chart');
    await user.click(screen.getAllByRole('button', { name: 'Add' }).at(-1) as HTMLButtonElement);
    // The panel's own Add, first: the form's comes after it.
    await user.click(screen.getAllByRole('button', { name: 'Add' })[0] as HTMLButtonElement);
    await user.click(screen.getByRole('menuitem', { name: 'Cards' }));
    await user.type(screen.getByRole('textbox', { name: "First card's title" }), 'Draft');
    slow.release();
    await settle();
    expect(overlays(store)).toEqual([]);
    expect(store.getState().project.assets).toEqual({});
    expect((screen.getByRole('textbox', { name: "First card's title" }) as HTMLInputElement).value).toBe(
      'Draft',
    );
  });

  it('adds one image for two clicks on Add while the file is read', async () => {
    const { store, user } = await openOverlays();
    await add(user, 'Image');
    const slow = slowFile('chart.png');
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, slow.file);
    await user.type(screen.getByRole('textbox', { name: 'Description (alt text)' }), 'A chart');
    const addButton = () => screen.getAllByRole('button', { name: 'Add' }).at(-1) as HTMLButtonElement;
    fireEvent.click(addButton());
    expect(addButton().disabled).toBe(true);
    fireEvent.click(addButton());
    slow.release();
    await settle();
    expect(overlays(store)).toEqual([{ type: 'image', asset: 'chart', alt: 'A chart' }]);
    expect(Object.keys(store.getState().project.assets)).toEqual(['chart']);
  });

  it('replaces no image removed and added again while the new file is read', async () => {
    const project = small();
    project.assets = { chart: `data:image/png;base64,${PNG}` };
    project.story.scenes[0]?.steps[0]?.overlays.push({ type: 'image', asset: 'chart', alt: 'A chart' });
    const { store, user } = await openOverlays(project);
    const slow = slowFile();
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, slow.file);
    // Its last overlay removed takes the image with it; then another image comes in under the same id.
    await user.click(screen.getByRole('button', { name: 'Remove overlay 1' }));
    expect(store.getState().project.assets).toEqual({});
    act(() => {
      store
        .getState()
        .editAll(
          [
            (p) => addAsset(p, { data: SVG, id: 'chart' }),
            (p) => addOverlay(p, 'S1.1', { type: 'image', asset: 'chart', alt: 'Another chart' }),
          ],
          'Another chart',
        );
    });
    slow.release();
    await settle();
    expect(store.getState().project.assets).toEqual({ chart: SVG });
    expect(await screen.findByText(/^Image chart changed while the file was read/)).toBeTruthy();
  });

  it('replaces no image that more steps show than when the file was chosen, until chosen again', async () => {
    const project = small();
    project.assets = { chart: SVG };
    project.story.scenes[0]?.steps[0]?.overlays.push({ type: 'image', asset: 'chart', alt: 'A chart' });
    const { store, user } = await openOverlays(project);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    // Shown on this step only: no question asked. Copied to the next steps while the file is read.
    const first = slowFile();
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, first.file);
    await user.click(screen.getByRole('button', { name: 'Copy overlay 1 to the following steps' }));
    first.release();
    await settle();
    expect(store.getState().project.assets).toEqual({ chart: SVG });
    expect(await screen.findByText(/^Image chart changed while the file was read/)).toBeTruthy();
    // Chosen again, asking about all three steps: replaced.
    await user.click(screen.getByRole('button', { name: 'Replace the image on all 3 steps…' }));
    expect(confirm).toHaveBeenCalledWith('Replace image chart on all 3 steps that show it?');
    const second = slowFile();
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, second.file);
    second.release();
    await settle();
    expect(store.getState().project.assets).toEqual({ chart: `data:image/png;base64,${PNG}` });
    confirm.mockRestore();
  });

  it('starts afresh on another project opened at a step of the same key, with nothing half-typed kept', async () => {
    const project = small();
    project.story.scenes[0]?.steps[0]?.overlays.push({ type: 'cards', items: [{ title: 'A1' }] });
    const { store, user } = await openOverlays(project);
    await user.type(screen.getByRole('textbox', { name: "New card's title" }), 'From the first map');
    await user.click(screen.getByRole('combobox', { name: 'Source to cite' }));
    await user.click(screen.getByRole('option', { name: /Test \(2020\)/ }));
    await user.type(screen.getByRole('textbox', { name: 'Pages to cite' }), '9');
    const other = small();
    other.meta.title = 'Another map';
    other.story.scenes[0]?.steps[0]?.overlays.push({ type: 'cards', items: [{ title: 'B1' }] });
    act(() => store.getState().open(other, { name: 'other.loopweft' }));
    expect((screen.getByRole('textbox', { name: 'Card 1 title' }) as HTMLInputElement).value).toBe('B1');
    expect((screen.getByRole('textbox', { name: "New card's title" }) as HTMLInputElement).value).toBe('');
    expect((screen.getByRole('combobox', { name: 'Source to cite' }) as HTMLInputElement).value).toBe('');
    expect((screen.getByRole('textbox', { name: 'Pages to cite' }) as HTMLInputElement).value).toBe('');
  });

  it('asks before replacing an image other steps show, and replaces nothing when told no', async () => {
    const project = small();
    project.assets = { chart: `data:image/png;base64,${PNG}` };
    for (const step of project.story.scenes[0]?.steps.slice(0, 2) ?? [])
      step.overlays.push({ type: 'image', asset: 'chart', alt: 'A chart' });
    const { store, user } = await openOverlays(project);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const pick = vi.spyOn(HTMLInputElement.prototype, 'click');
    await user.click(screen.getByRole('button', { name: 'Replace the image on all 2 steps…' }));
    expect(confirm).toHaveBeenCalledWith('Replace image chart on all 2 steps that show it?');
    expect(pick).not.toHaveBeenCalled();
    expect(store.getState().project.assets).toEqual({ chart: `data:image/png;base64,${PNG}` });
    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Replace the image on all 2 steps…' }));
    expect(pick).toHaveBeenCalledTimes(1);
  });

  it('removes one of two overlays of an image on a step, keeping the image, then the other with it', async () => {
    const project = small();
    project.assets = { chart: `data:image/png;base64,${PNG}` };
    project.story.scenes[0]?.steps[0]?.overlays.push(
      { type: 'image', asset: 'chart', alt: 'A chart' },
      { type: 'image', asset: 'chart', alt: 'The chart again', place: 'right' },
    );
    const { store, user } = await openOverlays(project);
    await user.click(screen.getByRole('button', { name: 'Remove overlay 2' }));
    expect(overlays(store)).toEqual([{ type: 'image', asset: 'chart', alt: 'A chart' }]);
    expect(Object.keys(store.getState().project.assets)).toEqual(['chart']);
    await user.click(screen.getByRole('button', { name: 'Remove overlay 1' }));
    expect(overlays(store)).toEqual([]);
    expect(store.getState().project.assets).toEqual({});
    expect(store.getState().past.at(-1)?.label).toBe('Step S1.1: removed the image chart and its overlay.');
    act(() => {
      store.getState().undo();
    });
    expect(overlays(store)).toHaveLength(1);
    expect(Object.keys(store.getState().project.assets)).toEqual(['chart']);
  });

  it('cites a source at the same pages once, and at other pages again', async () => {
    const { store, user } = await openOverlays();
    await add(user, 'Legend');
    const cite = async (pages: string) => {
      await user.click(screen.getByRole('combobox', { name: 'Source to cite' }));
      await user.click(screen.getByRole('option', { name: /Test \(2020\)/ }));
      await user.type(screen.getByRole('textbox', { name: 'Pages to cite' }), pages);
      await user.click(screen.getByRole('button', { name: 'Cite' }));
    };
    await cite('4');
    await cite('4');
    expect(overlays(store)?.[0]).toEqual({ type: 'legend', citations: [{ source: 'T', pages: '4' }] });
    await cite('5');
    expect(overlays(store)?.[0]).toEqual({
      type: 'legend',
      citations: [
        { source: 'T', pages: '4' },
        { source: 'T', pages: '5' },
      ],
    });
  });

  it('keeps a half-typed card with its own overlay when the overlays are reordered', async () => {
    const project = small();
    project.story.scenes[0]?.steps[0]?.overlays.push(
      { type: 'cards', items: [{ title: 'A1' }] },
      { type: 'cards', items: [{ title: 'B1' }] },
    );
    const { store, user } = await openOverlays(project);
    const drafts = () => screen.getAllByRole('textbox', { name: "New card's title" }) as HTMLInputElement[];
    await user.type(drafts()[0] as HTMLInputElement, 'A2');
    // A goes over B, its half-typed card with it.
    await user.click(screen.getByRole('button', { name: 'Move overlay 1 over' }));
    expect(overlays(store)?.map((o) => (o.type === 'cards' ? o.items[0]?.title : o.type))).toEqual([
      'B1',
      'A1',
    ]);
    expect(drafts().map((d) => d.value)).toEqual(['', 'A2']);
    const card = (drafts()[1] as HTMLElement).closest('.lw-overlay-card') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Add card' }));
    expect(overlays(store)).toEqual([
      { type: 'cards', items: [{ title: 'B1' }] },
      { type: 'cards', items: [{ title: 'A1' }, { title: 'A2' }] },
    ]);
  });

  it('keeps half-typed cards with their own overlays among overlays that are alike', async () => {
    const project = small();
    const alike: Overlay = { type: 'cards', items: [{ title: 'Same' }] };
    project.story.scenes[0]?.steps[0]?.overlays.push(structuredClone(alike), structuredClone(alike));
    const { store, user } = await openOverlays(project);
    const drafts = () => screen.getAllByRole('textbox', { name: "New card's title" }) as HTMLInputElement[];
    await user.type(drafts()[1] as HTMLInputElement, 'Kept');
    // Swapping two overlays that are alike changes nothing, so the half-typed card stays put, even once the
    // panel is drawn again.
    await user.click(screen.getByRole('button', { name: 'Move overlay 1 over' }));
    act(() => {
      store.getState().edit((p) => setStep(p, 'S1.1', { label: 'Renamed' }));
    });
    expect(drafts().map((d) => d.value)).toEqual(['', 'Kept']);
    // The first removed: the second keeps its own half-typed card.
    await user.click(screen.getByRole('button', { name: 'Remove overlay 1' }));
    expect(drafts().map((d) => d.value)).toEqual(['Kept']);
    // Undone: the first comes back in its place, and the half-typed card stays with the second; redone, the same.
    act(() => {
      store.getState().undo();
    });
    expect(drafts().map((d) => d.value)).toEqual(['', 'Kept']);
    act(() => {
      store.getState().redo();
    });
    expect(drafts().map((d) => d.value)).toEqual(['Kept']);
    await user.click(screen.getByRole('button', { name: 'Add card' }));
    expect(overlays(store)).toEqual([{ type: 'cards', items: [{ title: 'Same' }, { title: 'Kept' }] }]);
  });

  it('keeps a half-typed card with its overlay when another is changed to match it', async () => {
    const project = small();
    project.story.scenes[0]?.steps[0]?.overlays.push(
      { type: 'cards', items: [{ title: 'Other' }] },
      { type: 'cards', items: [{ title: 'Same' }] },
    );
    const { store, user } = await openOverlays(project);
    const drafts = () => screen.getAllByRole('textbox', { name: "New card's title" }) as HTMLInputElement[];
    await user.type(drafts()[1] as HTMLInputElement, 'Kept');
    // The first overlay's card renamed: the two overlays are now alike.
    const title = screen.getAllByRole('textbox', { name: 'Card 1 title' })[0] as HTMLInputElement;
    await user.clear(title);
    await user.type(title, 'Same');
    await user.tab();
    expect(overlays(store)?.[0]).toEqual({ type: 'cards', items: [{ title: 'Same' }] });
    expect(drafts().map((d) => d.value)).toEqual(['', 'Kept']);
    const card = (drafts()[1] as HTMLElement).closest('.lw-overlay-card') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Add card' }));
    expect(overlays(store)?.[1]).toEqual({ type: 'cards', items: [{ title: 'Same' }, { title: 'Kept' }] });
  });

  it('keeps half-typed cards with their overlays when edits bring back an earlier order', async () => {
    const project = small();
    project.story.scenes[0]?.steps[0]?.overlays.push(
      { type: 'cards', items: [{ title: 'A' }] },
      { type: 'cards', items: [{ title: 'B' }] },
    );
    const { store, user } = await openOverlays(project);
    const drafts = () => screen.getAllByRole('textbox', { name: "New card's title" }) as HTMLInputElement[];
    const titles = () => screen.getAllByRole('textbox', { name: 'Card 1 title' }) as HTMLInputElement[];
    const rename = async (k: number, title: string) => {
      const field = titles()[k] as HTMLInputElement;
      await user.clear(field);
      await user.type(field, title);
      await user.tab();
    };
    // A goes after B; then the two are renamed, so the contents read A, B again, though A's overlay is second.
    await user.click(screen.getByRole('button', { name: 'Move overlay 1 over' }));
    await user.type(drafts()[1] as HTMLInputElement, 'With the first');
    await rename(0, 'A');
    await rename(1, 'B');
    expect(overlays(store)?.map((o) => (o.type === 'cards' ? o.items[0]?.title : ''))).toEqual(['A', 'B']);
    expect(drafts().map((d) => d.value)).toEqual(['', 'With the first']);
  });

  it("shows and changes a citation's pages, note and strength, and keeps them through every change", async () => {
    const project = small();
    project.story.scenes[0]?.steps[0]?.overlays.push({
      type: 'statement',
      lines: ['Why now?'],
      citations: [{ source: 'T', pages: '4', strength: 'strong', note: 'Fig. 2' }],
    });
    const { store, user } = await openOverlays(project);
    const row = () => within(screen.getByRole('group', { name: 'Citation of Test (2020), p. 4' }));
    expect((row().getByRole('textbox', { name: 'Pages: Test (2020), p. 4' }) as HTMLInputElement).value).toBe(
      '4',
    );
    const note = row().getByRole('textbox', { name: 'Note: Test (2020), p. 4' }) as HTMLInputElement;
    expect(note.value).toBe('Fig. 2');
    expect((row().getByRole('radio', { name: 'Strong' }) as HTMLInputElement).checked).toBe(true);
    await user.clear(note);
    await user.type(note, 'Fig. 3{Enter}');
    await user.click(row().getByRole('radio', { name: 'Weak' }));
    const first = { source: 'T', pages: '4', strength: 'weak', note: 'Fig. 3' };
    expect(overlays(store)?.[0]).toMatchObject({ citations: [first] });
    // Another citation added, then removed: the first keeps its note and strength.
    await user.click(screen.getByRole('combobox', { name: 'Source to cite' }));
    await user.click(screen.getByRole('option', { name: /Test \(2020\)/ }));
    await user.type(screen.getByRole('textbox', { name: 'Pages to cite' }), '5');
    await user.click(screen.getByRole('button', { name: 'Cite' }));
    expect(overlays(store)?.[0]).toMatchObject({ citations: [first, { source: 'T', pages: '5' }] });
    await user.click(screen.getByRole('button', { name: 'Remove the citation of T p. 5' }));
    expect(overlays(store)?.[0]).toMatchObject({ citations: [first] });
    // Copied to the following steps, undone, and saved.
    await user.click(screen.getByRole('button', { name: 'Copy overlay 1 to the following steps' }));
    expect(overlays(store, 1)?.[0]).toMatchObject({ citations: [first] });
    expect(overlays(store, 2)?.at(-1)).toMatchObject({ citations: [first] });
    act(() => {
      store.getState().undo();
    });
    expect(overlays(store, 1)).toEqual([]);
    expect(overlays(store)?.[0]).toMatchObject({ citations: [first] });
    const saved = readProject(serializeProject(store.getState().project));
    expect(saved.ok && saved.project.story.scenes[0]?.steps[0]?.overlays[0]).toMatchObject({
      citations: [first],
    });
    // Pages changed to a pair it already cites would cite it twice: refused.
    await user.click(screen.getByRole('combobox', { name: 'Source to cite' }));
    await user.click(screen.getByRole('option', { name: /Test \(2020\)/ }));
    await user.click(screen.getByRole('button', { name: 'Cite' }));
    const pages = row().getByRole('textbox', { name: 'Pages: Test (2020), p. 4' });
    await user.clear(pages);
    await user.type(pages, '{Enter}');
    expect(await screen.findByText('It already cites T at those pages.')).toBeTruthy();
    expect(overlays(store)?.[0]).toMatchObject({ citations: [first, { source: 'T' }] });
  });
});
