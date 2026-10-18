// The Types and Look panels in jsdom: categories, roles, link types and fields edited one step at a time,
// a type in use removed only after asking, and the theme, palette and fonts with their colour checks.
import { createProject, type Project, setVariable } from '@loopweft/model';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/app.tsx';
import { memoryRecovery } from '../src/state/recovery.ts';
import { createStudioStore, type StudioStore } from '../src/state/store.ts';

function small(): Project {
  const p = createProject({ title: 'Small map' });
  p.types.categories = [
    { id: 'people', name: 'People' },
    { id: 'money', name: 'Money', colour: '#F2B36B' },
  ];
  p.types.linkTypes = [{ id: 'flow', name: 'Flow' }];
  p.variables = [
    { id: 'births', label: 'Births', category: 'people', citations: [] },
    { id: 'population', label: 'Population', citations: [] },
  ];
  p.links = [{ id: 'L1', from: 'births', to: 'population', sign: '+', type: 'flow', citations: [] }];
  return p;
}

async function openPanel(panel: 'Types' | 'Look', project: Project = small()) {
  const store: StudioStore = createStudioStore(project, { name: 'small.loopweft' });
  render(<App store={store} recovery={memoryRecovery()} env="test" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('tab', { name: panel }));
  return { store, user };
}

const categories = (store: StudioStore) => store.getState().project.types.categories;

describe('the Types panel', () => {
  it('renames a category and gives it a colour of its own, or the palette’s again', async () => {
    const { store, user } = await openPanel('Types');
    expect(screen.getByText('1 variable')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'People: edit' }));
    const name = screen.getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'Society{Enter}');
    expect(categories(store)[0]?.name).toBe('Society');

    const colour = screen.getByRole('textbox', { name: 'Colour' });
    await user.type(colour, '#336699');
    fireEvent.blur(colour);
    expect(categories(store)[0]?.colour).toBe('#336699');
    await user.click(screen.getByRole('button', { name: "Use the palette's colour instead" }));
    expect(categories(store)[0]?.colour).toBeUndefined();
  });

  it('adds a category, reorders the list, and removes one in use only after asking', async () => {
    const { store, user } = await openPanel('Types');
    await user.type(screen.getByRole('textbox', { name: 'New category' }), 'Climate{Enter}');
    expect(categories(store).map((c) => c.id)).toEqual(['people', 'money', 'climate']);
    // The new one is open to edit.
    expect((screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('Climate');

    await user.click(screen.getByRole('button', { name: 'Move People down' }));
    expect(categories(store).map((c) => c.id)).toEqual(['money', 'people', 'climate']);

    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await user.click(screen.getByRole('button', { name: 'Remove People' }));
    expect(confirm).toHaveBeenLastCalledWith(
      'Category "People": it is used by 1 variable. The variables lose it, and groups drawn in it are removed. Remove it?',
    );
    expect(categories(store)).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: 'Remove People' }));
    expect(categories(store).map((c) => c.id)).toEqual(['money', 'climate']);
    expect(store.getState().project.variables[0]?.category).toBeUndefined();
    // A type nothing uses goes without asking.
    await user.click(screen.getByRole('button', { name: 'Remove Climate' }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(categories(store).map((c) => c.id)).toEqual(['money']);
  });

  it('adds a role only with a shape, and draws link types as asked', async () => {
    const { store, user } = await openPanel('Types');
    await user.click(screen.getByRole('radio', { name: 'Roles' }));
    await user.type(screen.getByRole('textbox', { name: 'New role' }), 'Driver');
    expect(screen.getByRole('button', { name: 'Add' })).toHaveProperty('disabled', true);
    await user.click(screen.getByRole('combobox', { name: 'Its shape' }));
    await user.click(screen.getByRole('option', { name: 'Hexagon' }));
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(store.getState().project.types.roles).toEqual([
      { id: 'driver', name: 'Driver', shape: 'hexagon' },
    ]);

    await user.click(screen.getByRole('radio', { name: 'Link types' }));
    await user.click(screen.getByRole('button', { name: 'Flow: edit' }));
    await user.click(screen.getByRole('radio', { name: 'Dashed' }));
    await user.click(screen.getByRole('switch', { name: /^Optional/ }));
    expect(store.getState().project.types.linkTypes[0]).toEqual({
      id: 'flow',
      name: 'Flow',
      style: 'dashed',
      optional: true,
    });
    await user.click(screen.getByRole('radio', { name: 'Solid' }));
    expect(store.getState().project.types.linkTypes[0]?.style).toBeUndefined();
  });

  it('adds a field of one of a list, and keeps its kind once a value of it is on the map', async () => {
    const { store, user } = await openPanel('Types');
    await user.click(screen.getByRole('radio', { name: 'Fields' }));
    await user.type(screen.getByRole('textbox', { name: 'New field' }), 'Region');
    await user.click(screen.getByRole('combobox', { name: 'Its kind' }));
    await user.click(screen.getByRole('option', { name: 'One of a list' }));
    await user.type(screen.getByRole('textbox', { name: 'Its options, one per line' }), 'North{Enter}South');
    await user.click(screen.getByRole('radio', { name: 'Variables' }));
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(store.getState().project.types.fields).toEqual([
      {
        id: 'region',
        name: 'Region',
        kind: 'choice',
        appliesTo: 'variables',
        options: [
          { id: 'north', name: 'North' },
          { id: 'south', name: 'South' },
        ],
      },
    ]);
    // Its kind can change while nothing holds a value of it.
    expect(screen.getByRole('combobox', { name: 'Kind' })).toBeTruthy();
    act(() => {
      store.getState().edit((p) => setVariable(p, 'births', { fields: { region: 'north' } }));
    });
    expect(screen.getByText(/1 value of it is on the map, so its kind stays/)).toBeTruthy();
    await user.type(screen.getByRole('textbox', { name: 'New option' }), 'East{Enter}');
    expect(store.getState().project.types.fields[0]?.options?.map((o) => o.id)).toEqual([
      'north',
      'south',
      'east',
    ]);
  });
});

describe('the Look panel', () => {
  it('sets the stage and the palette, checking each palette on that stage', async () => {
    const { store, user } = await openPanel('Look');
    const okabe = screen.getByRole('radio', { name: /Okabe–Ito/ });
    expect(okabe.closest('.lw-palette')?.textContent).toContain(
      'Apart for typical vision and the three colour-vision deficiencies',
    );
    await user.click(okabe);
    expect(store.getState().project.theme.palette).toBe('okabe-ito');
    await user.click(screen.getByRole('radio', { name: 'Light' }));
    expect(store.getState().project.theme.base).toBe('light');
    // On the light stage some of Okabe–Ito's colours stand out too little.
    expect(screen.getByRole('radio', { name: /Okabe–Ito/ }).closest('.lw-palette')?.textContent).toMatch(
      /colours? below 3:1 on this stage/,
    );
  });

  it("shows the map's categories as each vision sees them, and names the pairs too close", async () => {
    const p = small();
    p.types.categories = [
      { id: 'a', name: 'Alpha', colour: '#D55E00' },
      { id: 'b', name: 'Beta', colour: '#D65F02' },
    ];
    await openPanel('Look', p);
    const table = screen.getByRole('table');
    expect(within(table).getByLabelText('Alpha in deuteranopia (no green cones)')).toBeTruthy();
    expect(
      screen.getByText(/^Hard to tell apart in typical colour vision: "Alpha" and "Beta" \(ΔE \d/),
    ).toBeTruthy();
  });

  it("makes a palette of the map's own from the chosen one, recolours it, and removes it only after asking", async () => {
    const { store, user } = await openPanel('Look');
    const theme = () => store.getState().project.theme;
    const own = () => theme().palettes?.[0];
    await user.click(screen.getByRole('radio', { name: /Okabe–Ito/ }));
    await user.click(screen.getByRole('button', { name: 'New palette from this one' }));
    expect(own()).toMatchObject({
      name: 'Okabe–Ito (copy)',
      colours: ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7'],
    });
    // The map uses the copy at once, and the copy is listed as the map's own, checked like a preset.
    expect(theme().palette).toBe(own()?.id);
    expect(
      screen.getByRole('radio', { name: /Okabe–Ito \(copy\)/ }).closest('.lw-palette')?.textContent,
    ).toContain('Apart for typical vision and the three colour-vision deficiencies');

    const name = screen.getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'Mine{Enter}');
    expect(own()?.name).toBe('Mine');
    await user.click(screen.getByRole('button', { name: 'Move colour 2 up' }));
    expect(own()?.colours.slice(0, 2)).toEqual(['#56B4E9', '#E69F00']);
    await user.click(screen.getByRole('button', { name: 'Take out colour 1' }));
    expect(own()?.colours).toHaveLength(6);
    // Pasted as text, colours replace them all; two are the fewest a palette has.
    const text = screen.getByRole('textbox', { name: 'Colours as text' });
    await user.clear(text);
    await user.type(text, '#b2182b, #2166ac');
    await user.tab();
    expect(own()?.colours).toEqual(['#B2182B', '#2166AC']);
    expect((screen.getByRole('button', { name: 'Take out colour 1' }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await user.click(screen.getByRole('button', { name: 'Remove this palette' }));
    expect(confirm).toHaveBeenLastCalledWith(
      'Remove the palette "Mine" from this map? The map goes back to the Loopweft palette.',
    );
    expect(theme().palettes).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Remove this palette' }));
    expect(theme().palettes).toBeUndefined();
    expect(theme().palette).toBeUndefined();
    confirm.mockRestore();
  });

  it('names fonts, and clears them', async () => {
    const { store, user } = await openPanel('Look');
    await user.type(screen.getByRole('textbox', { name: 'Headings' }), 'Lora{Enter}');
    expect(store.getState().project.theme.fonts).toEqual({ heading: 'Lora' });
    await user.clear(screen.getByRole('textbox', { name: 'Headings' }));
    await user.tab();
    expect(store.getState().project.theme.fonts).toBeUndefined();
  });
});
