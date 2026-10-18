// The Studio's components in jsdom: the header, the inspector's edits and their undo, the canvas, the File
// menu, and the offer to bring back a map from a crash.
import { createProject, type Project, serializeProject } from '@loopweft/model';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/app.tsx';
import { memoryRecovery, type RecoveryStore } from '../src/state/recovery.ts';
import { createStudioStore, type StudioStore } from '../src/state/store.ts';

/** A small map: two variables, a link each way (one of unknown sign), no citations. */
function small(): Project {
  const p = createProject({ title: 'Small map' });
  p.types.categories = [{ id: 'people', name: 'People' }];
  p.variables = [
    { id: 'births', label: 'Births', category: 'people', citations: [] },
    { id: 'population', label: 'Population', citations: [] },
  ];
  p.links = [
    { id: 'L1', from: 'births', to: 'population', sign: '+', citations: [] },
    { id: 'L2', from: 'population', to: 'births', sign: '?', citations: [] },
  ];
  p.layout.positions = { births: { x: 300, y: 300 }, population: { x: 700, y: 300 } };
  return p;
}

function renderStudio(
  store: StudioStore = createStudioStore(small(), { name: 'small.loopweft' }),
  recovery: RecoveryStore = memoryRecovery(),
) {
  render(<App store={store} recovery={recovery} env="test" />);
  return store;
}

describe('the Studio', () => {
  it("shows the map's title, where it is saved, and how big it is", async () => {
    renderStudio();
    expect(screen.getByRole('button', { name: 'Small map (rename)' })).toBeTruthy();
    expect(screen.getByRole('status', { name: 'Save status: Saved · small.loopweft' })).toBeTruthy();
    expect(screen.getByText('2 variables · 2 links · 0 named loops')).toBeTruthy();
    // The checks flag the uncited links and the unknown sign.
    expect(screen.getByText('3 to look at')).toBeTruthy();
  });

  it('renames the map from its title', async () => {
    const store = renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Small map (rename)' }));
    const field = screen.getByRole('textbox', { name: 'Map title' });
    await user.clear(field);
    await user.type(field, 'Population{Enter}');
    expect(store.getState().project.meta.title).toBe('Population');
    expect(screen.getByRole('status', { name: 'Save status: Unsaved changes' }).textContent).toBe(
      'Unsaved changes',
    );
  });

  it('edits a variable in the inspector, one step per change, and undoes it', async () => {
    const store = renderStudio();
    const user = userEvent.setup();
    act(() => store.getState().select({ variables: ['births'] }));
    const name = screen.getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'Birth rate');
    // Typing changes nothing until the field is left.
    expect(store.getState().project.variables[0]?.label).toBe('Births');
    await user.tab();
    expect(store.getState().project.variables[0]?.label).toBe('Birth rate');
    await user.click(screen.getByRole('button', { name: 'Undo: Changed variable births: label.' }));
    expect(store.getState().project.variables[0]?.label).toBe('Births');
    expect((screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('Births');
  });

  it("sets a link's sign and its delay", async () => {
    const store = renderStudio();
    const user = userEvent.setup();
    act(() => store.getState().select({ links: ['L2'] }));
    await user.click(screen.getByRole('radio', { name: '− opposite' }));
    expect(store.getState().project.links[1]?.sign).toBe('-');
    await user.click(screen.getByRole('switch', { name: 'Delayed: takes notably long' }));
    const howLong = screen.getByRole('textbox', { name: 'How long' });
    await user.type(howLong, '5 yrs{Enter}');
    expect(store.getState().project.links[1]).toMatchObject({ delay: true, delayLabel: '5 yrs' });
    await user.click(screen.getByRole('switch', { name: 'Delayed: takes notably long' }));
    expect(store.getState().project.links[1]?.delay).toBeUndefined();
    expect(store.getState().project.links[1]?.delayLabel).toBeUndefined();
  });

  it('says why an edit is refused, and changes nothing', async () => {
    const store = renderStudio();
    const user = userEvent.setup();
    act(() => store.getState().select({ variables: ['births'] }));
    // A blank name is refused by the field itself; the store is untouched.
    const name = screen.getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.tab();
    expect(store.getState().past).toHaveLength(0);
    expect((name as HTMLInputElement).value).toBe('Births');
  });

  it('lists what the checks flag, and selects the element of a flag', async () => {
    const store = renderStudio();
    const user = userEvent.setup();
    const flag = screen.getByRole('button', { name: /^Select links\[1\]\.sign:/ });
    await user.click(flag);
    expect(store.getState().selection.links).toEqual(['L2']);
  });

  it('draws the map on the canvas, and selects what is clicked', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 1000,
      height: 700,
      right: 1000,
      bottom: 700,
      toJSON: () => ({}),
    } as DOMRect);
    const store = renderStudio();
    const map = await screen.findByRole('img', { name: 'The map: 2 variables and 2 links' });
    expect(map.querySelectorAll('[data-node]')).toHaveLength(2);
    expect(map.querySelectorAll('[data-edge]')).toHaveLength(2);
    expect(within(map as unknown as HTMLElement).getByText('?')).toBeTruthy();
    fireEvent.pointerDown(map.querySelector('[data-node="population"] .hit') as Element, { button: 0 });
    expect(store.getState().selection.variables).toEqual(['population']);
    fireEvent.pointerDown(map.querySelector('[data-node="births"] .hit') as Element, {
      button: 0,
      shiftKey: true,
    });
    expect(store.getState().selection.variables).toEqual(['population', 'births']);
    expect(screen.getByText('2 variables and 0 links.')).toBeTruthy();
  });

  it('starts a map from a template, asking first when there are unsaved changes', async () => {
    const store = createStudioStore(small(), null, false);
    renderStudio(store);
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await user.click(screen.getByRole('button', { name: 'File' }));
    await user.click(screen.getByRole('menuitem', { name: 'New from a template…' }));
    const gallery = screen.getByRole('dialog', { name: 'New map' });
    // The blank map, the eight archetypes and the polycrisis example, each with a picture.
    expect(within(gallery).getAllByRole('img', { name: /^A picture of / })).toHaveLength(10);
    await user.click(within(gallery).getByRole('button', { name: 'Fixes that fail' }));
    expect(confirm).toHaveBeenCalledWith('“Small map” has unsaved changes. Discard them?');
    expect(store.getState().project.meta.title).toBe('Small map');
    confirm.mockReturnValue(true);
    await user.click(within(gallery).getByRole('button', { name: 'Fixes that fail' }));
    expect(store.getState().project.meta.title).toBe('Fixes that fail');
    expect(screen.queryByRole('dialog', { name: 'New map' })).toBeNull();
    expect(store.getState().project.variables.map((v) => v.label)).toEqual([
      'Problem symptom',
      'Fix',
      'Unintended consequence',
    ]);
  });

  it('offers back a map that had unsaved changes when the Studio last closed', async () => {
    const recovery = memoryRecovery();
    const lost = small();
    lost.meta.title = 'Lost work';
    await recovery.write({ text: serializeProject(lost), name: 'lost.loopweft' });
    const store = renderStudio(
      createStudioStore(createProject({ title: 'Untitled map' }), null, false),
      recovery,
    );
    const offer = await screen.findByRole('alert');
    expect(offer.textContent).toContain(
      'Lost work had unsaved changes when the Studio last closed (from lost.loopweft).',
    );
    await userEvent.setup().click(within(offer).getByRole('button', { name: 'Bring it back' }));
    expect(store.getState().project.meta.title).toBe('Lost work');
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByRole('status', { name: 'Save status: Unsaved changes' })).toBeTruthy();
  });
});
