// Editing on the canvas: the helpers behind it (pure), and the gestures themselves in jsdom: double-click to
// add, drag from a handle to link (the sign is asked), click an arrowhead to flip, drag to move, Shift-drag
// to select an area, Delete to remove, line up, and frame the home view.
import { createProject, type Project } from '@loopweft/model';
import { buildGraph } from '@loopweft/render';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/app.tsx';
import {
  alignment,
  lineUp,
  pinWhereDrawn,
  placeVariable,
  previewMove,
  removalImpact,
  removalQuestion,
  removeSelection,
} from '../src/map/edit.ts';
import {
  fitView,
  homeFromView,
  mapBounds,
  stageFrame,
  toMap,
  toScreen,
  viewForHome,
} from '../src/map/view.ts';
import { memoryRecovery } from '../src/state/recovery.ts';
import { createStudioStore, type StudioStore } from '../src/state/store.ts';
import { example } from './helpers.ts';

function three(): Project {
  const p = createProject({ title: 'Three' });
  p.variables = [
    { id: 'a', label: 'A', citations: [] },
    { id: 'b', label: 'B', citations: [] },
    { id: 'c', label: 'C', citations: [] },
  ];
  p.links = [
    { id: 'L1', from: 'a', to: 'b', sign: '+', citations: [] },
    { id: 'L2', from: 'b', to: 'c', sign: '?', citations: [] },
  ];
  p.layout.positions = { a: { x: 200, y: 300 }, b: { x: 600, y: 360 }, c: { x: 1000, y: 280 } };
  return p;
}

describe('the canvas helpers', () => {
  it('places a new variable where it was asked for, in whole units', () => {
    const out = placeVariable(three(), 'Deaths', { x: 410.6, y: 99.2 });
    expect(out.result).toEqual({ id: 'deaths' });
    expect(out.project.layout.positions.deaths).toEqual({ x: 411, y: 99 });
    expect(out.summary).toBe('Added variable deaths ("Deaths").');
  });

  it('previews a drag by moving only the dragged variables and reshaping their links', () => {
    const graph = buildGraph(three());
    const moved = previewMove(graph, { b: { x: 650, y: 500 } });
    expect(moved.nodes.get('b')).toMatchObject({ x: 650, y: 500 });
    expect(moved.nodes.get('a')).toBe(graph.nodes.get('a'));
    expect(moved.edges.get('L1')?.geom).not.toEqual(graph.edges.get('L1')?.geom);
    expect(graph.nodes.get('b')).toMatchObject({ x: 600, y: 360 });
  });

  it('lines variables up and spaces them evenly', () => {
    const graph = buildGraph(three());
    expect(alignment(graph, ['a', 'b', 'c'], 'top')).toEqual({
      a: { x: 200, y: 280 },
      b: { x: 600, y: 280 },
      c: { x: 1000, y: 280 },
    });
    expect(alignment(graph, ['a', 'b', 'c'], 'centre')).toEqual({
      a: { x: 600, y: 300 },
      b: { x: 600, y: 360 },
      c: { x: 600, y: 280 },
    });
    expect(alignment(graph, ['a', 'c', 'b'], 'down')).toEqual({
      c: { x: 1000, y: 280 },
      a: { x: 200, y: 320 },
      b: { x: 600, y: 360 },
    });
    expect(alignment(graph, ['a'], 'left')).toEqual({});
  });

  it('never lines two variables up on one spot, and says when a press would change nothing', () => {
    const p = three();
    // Left lines a and b up on a's x: one above the other.
    const left = lineUp(buildGraph(p), ['a', 'b'], 'left');
    expect(left).toEqual({ moves: { a: { x: 200, y: 300 }, b: { x: 200, y: 360 } } });
    p.layout.positions.b = { x: 200, y: 360 };
    // Left again changes nothing, and says so.
    expect(lineUp(buildGraph(p), ['a', 'b'], 'left')).toEqual({
      refused: 'They are lined up on the left-most one already.',
    });
    // Top would put b on a: refused, with both named.
    expect(lineUp(buildGraph(p), ['a', 'b'], 'top')).toEqual({
      refused:
        'Lining them up on the top one would put “A” and “B” on top of each other: they are in a column already. Move one of them first.',
    });
    // Two already on one spot (placed so by hand) do not stop a press that moves them.
    p.layout.positions.b = { x: 200, y: 300 };
    expect('moves' in lineUp(buildGraph(p), ['a', 'b', 'c'], 'top')).toBe(true);
  });

  it('never lines a variable up over one that is not selected', () => {
    const p = three();
    // Left moves b to (200, 360), where c is.
    p.layout.positions.c = { x: 200, y: 360 };
    expect(lineUp(buildGraph(p), ['a', 'b'], 'left')).toEqual({
      refused:
        'Lining them up on the left-most one would put “B” on top of “C”, which is not selected. Move one of them first.',
    });
  });

  it('never makes two that overlap a little overlap more', () => {
    const p = three();
    p.layout.positions = { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, c: { x: 2000, y: 2000 } };
    expect(lineUp(buildGraph(p), ['a', 'b'], 'left')).toEqual({
      refused:
        'Lining them up on the left-most one would put “A” and “B” on top of each other: they are in a row already. Move one of them first.',
    });
  });

  it('says Space evenly across would overlap two in a row', () => {
    const p = three();
    const r = buildGraph(p).nodes.get('a')?.r as number;
    // b, close to c, would go half way: over a.
    p.layout.positions = { a: { x: 0, y: 0 }, b: { x: 3 * r, y: 0 }, c: { x: 3.5 * r, y: 0 } };
    expect(lineUp(buildGraph(p), ['a', 'b', 'c'], 'across')).toMatchObject({
      refused: expect.stringContaining('on top of each other: they are in a row already.'),
    });
  });

  it('tells overlap by each glyph’s own shape, as the canvas draws it', () => {
    const shaped = (shape: 'octagon' | 'square', dx: number) => {
      const p = three();
      p.types.roles = [{ id: 'r', name: 'R', shape }];
      for (const v of p.variables) v.role = 'r';
      p.layout.positions = { a: { x: 0, y: 0 }, b: { x: dx, y: 100 }, c: { x: 2000, y: 2000 } };
      return buildGraph(p);
    };
    const r = buildGraph(three()).nodes.get('a')?.r as number;
    // Octagons reach past the radius (by a fifth or so): side by side within that, Top would overlap them.
    expect(lineUp(shaped('octagon', 2 * r + 2), ['a', 'b'], 'top')).toMatchObject({
      refused: expect.stringContaining('on top of each other'),
    });
    // Squares stay within it: side by side just over their width apart, Top leaves them clear.
    expect(lineUp(shaped('square', 2 * r - 2), ['a', 'b'], 'top')).toMatchObject({
      moves: expect.any(Object),
    });
  });

  it('pins what an automatic layout placed where the canvas draws it', () => {
    const p = three();
    delete p.layout.positions.c;
    const graph = buildGraph(p);
    const drawn = graph.nodes.get('c');
    const out = pinWhereDrawn(p, graph, ['b', 'c'], true);
    expect(out.project.layout.positions.c).toEqual({
      x: Math.round(drawn?.x ?? 0),
      y: Math.round(drawn?.y ?? 0),
      pinned: true,
    });
    expect(out.project.layout.positions.b?.pinned).toBe(true);
  });

  it('removes a selection with the links of its variables, and says first what else goes', () => {
    const p = example();
    const impact = removalImpact(p, ['food_insecurity'], []);
    expect(impact.loops.length).toBeGreaterThan(0);
    expect(impact.steps.length).toBeGreaterThan(0);
    expect(removalQuestion(impact, 1)).toMatch(
      /^Removing this also removes \d+ named loops \(.+\) and the \d+ story steps that mention them \(.+\)\. Remove\?$/,
    );
    const out = removeSelection(three(), ['b'], []);
    expect(out.project.variables.map((v) => v.id)).toEqual(['a', 'c']);
    expect(out.project.links).toEqual([]);
    expect(out.summary).toBe('Removed 1 variable and 2 links.');
  });

  it('turns the stage frame into a home view and back', () => {
    const size = { w: 1200, h: 800 };
    const frame = stageFrame(size);
    expect(frame.w / frame.h).toBeCloseTo(16 / 9, 5);
    const view = { k: 0.5, dx: 100, dy: 50 };
    const home = homeFromView(view, size);
    expect(home).toEqual({
      x: Math.round(toMap(view, 600, 400).x),
      y: Math.round(toMap(view, 600, 400).y),
      zoom: Math.round(((1920 * 0.5) / frame.w) * 1000) / 1000,
    });
    const back = viewForHome(home, size);
    expect(homeFromView(back, size)).toEqual(home);
  });
});

/** The canvas at 1000 × 700, with the map fitted as the canvas fits it. */
function setup(project: Project = three()) {
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
  const store: StudioStore = createStudioStore(project, { name: 'three.loopweft' });
  render(<App store={store} recovery={memoryRecovery()} env="test" />);
  const view = fitView(mapBounds(buildGraph(project)), { w: 1000, h: 700 });
  const map = screen.getByRole('img', { name: /^The map:/ });
  const at = (id: string) => {
    const p = project.layout.positions[id] as { x: number; y: number };
    return toScreen(view, p.x, p.y);
  };
  return { store, view, map, at };
}

describe('editing on the canvas', () => {
  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('adds a variable where the background is double-clicked, once it is named', async () => {
    const { store, view, map } = setup();
    fireEvent.doubleClick(map.querySelector('.lw-canvas-bg') as Element, { clientX: 500, clientY: 600 });
    const name = screen.getByRole('textbox', { name: 'Name of the new variable' });
    await userEvent.setup().type(name, 'Deaths{Enter}');
    const where = toMap(view, 500, 600);
    expect(store.getState().project.layout.positions.deaths).toEqual({
      x: Math.round(where.x),
      y: Math.round(where.y),
    });
    expect(store.getState().selection.variables).toEqual(['deaths']);
    expect(store.getState().past.map((e) => e.label)).toEqual(['Added variable deaths ("Deaths").']);
  });

  it('adds nothing when the name is left empty', async () => {
    const { store, map } = setup();
    fireEvent.doubleClick(map.querySelector('.lw-canvas-bg') as Element, { clientX: 500, clientY: 600 });
    await userEvent
      .setup()
      .type(screen.getByRole('textbox', { name: 'Name of the new variable' }), '{Escape}');
    expect(store.getState().past).toEqual([]);
  });

  it('links two variables by dragging from a handle, with the sign asked, never assumed', async () => {
    const { store, map, at } = setup();
    const c = map.querySelector('[data-node="c"] .hit') as Element;
    document.elementFromPoint = () => c;
    const from = at('a');
    const to = at('c');
    fireEvent.pointerDown(map.querySelector('[data-handle="a"]') as Element, {
      button: 0,
      clientX: from.x + 12,
      clientY: from.y,
    });
    fireEvent.pointerMove(map, { clientX: to.x, clientY: to.y });
    expect(map.querySelector('.lw-link-draft')).not.toBeNull();
    fireEvent.pointerUp(map, { clientX: to.x, clientY: to.y });
    // Nothing is added until the sign is chosen.
    expect(store.getState().project.links).toHaveLength(2);
    const ask = screen.getByRole('dialog', { name: 'The sign of the link' });
    await userEvent.setup().click(within(ask).getByRole('button', { name: '− falls' }));
    expect(store.getState().project.links.at(-1)).toEqual({
      id: 'L3',
      from: 'a',
      to: 'c',
      sign: '-',
      citations: [],
    });
    expect(store.getState().selection.links).toEqual(['L3']);
  });

  it('flips a sign when its arrowhead is clicked, and asks for one that is not known', async () => {
    const { store, map } = setup();
    fireEvent.pointerDown(map.querySelector('[data-sign="L1"]') as Element, {
      button: 0,
      clientX: 10,
      clientY: 10,
    });
    expect(store.getState().project.links[0]?.sign).toBe('-');
    expect(store.getState().past.at(-1)?.label).toBe('Flipped L1 (a → b) from + to −.');
    fireEvent.pointerDown(map.querySelector('[data-sign="L2"]') as Element, {
      button: 0,
      clientX: 10,
      clientY: 10,
    });
    await userEvent.setup().click(screen.getByRole('button', { name: '+ rises too' }));
    expect(store.getState().project.links[1]?.sign).toBe('+');
  });

  it('moves the dragged variables together, as one step', () => {
    const { store, view, map, at } = setup();
    act(() => store.getState().select({ variables: ['a', 'b'] }));
    const start = at('a');
    fireEvent.pointerDown(map.querySelector('[data-node="a"] .hit') as Element, {
      button: 0,
      clientX: start.x,
      clientY: start.y,
    });
    fireEvent.pointerMove(map, { clientX: start.x + 40, clientY: start.y + 30 });
    fireEvent.pointerUp(map, { clientX: start.x + 40, clientY: start.y + 30 });
    const dx = Math.round(40 / view.k);
    const dy = Math.round(30 / view.k);
    expect(store.getState().project.layout.positions).toMatchObject({
      a: { x: 200 + dx, y: 300 + dy },
      b: { x: 600 + dx, y: 360 + dy },
      c: { x: 1000, y: 280 },
    });
    expect(store.getState().past).toHaveLength(1);
  });

  it('selects an area with Shift-drag, and removes the selection with Delete', async () => {
    const { store, map, at } = setup();
    const a = at('a');
    const b = at('b');
    const background = map.querySelector('.lw-canvas-bg') as Element;
    fireEvent.pointerDown(background, { button: 0, shiftKey: true, clientX: a.x - 20, clientY: a.y - 40 });
    fireEvent.pointerMove(map, { clientX: b.x + 20, clientY: b.y + 20 });
    fireEvent.pointerUp(map, { clientX: b.x + 20, clientY: b.y + 20 });
    expect(store.getState().selection).toMatchObject({ variables: ['a', 'b'], links: ['L1'] });
    await userEvent.setup().keyboard('{Delete}');
    expect(store.getState().project.variables.map((v) => v.id)).toEqual(['c']);
    expect(store.getState().past.at(-1)?.label).toBe('Removed 2 variables and 2 links.');
  });

  it('lines up the selected variables from the inspector', async () => {
    const { store } = setup();
    act(() => store.getState().select({ variables: ['a', 'b', 'c'] }));
    await userEvent.setup().click(screen.getByRole('button', { name: 'Top' }));
    expect(Object.values(store.getState().project.layout.positions).map((p) => p.y)).toEqual([280, 280, 280]);
  });

  it('says why a Line up press does nothing, and never stacks two variables', async () => {
    const { store } = setup();
    const user = userEvent.setup();
    act(() => store.getState().select({ variables: ['a', 'b'] }));
    await user.click(screen.getByRole('button', { name: 'Left' }));
    const lined = store.getState().project.layout.positions;
    expect([lined.a?.x, lined.b?.x]).toEqual([200, 200]);
    // Top would put one on the other: refused, and the Undo history keeps only the Left.
    const steps = store.getState().past.length;
    await user.click(screen.getByRole('button', { name: 'Top' }));
    expect(screen.getByRole('status', { name: 'Line up' }).textContent).toMatch(
      /would put “A” and “B” on top of each other/,
    );
    expect(store.getState().project.layout.positions).toEqual(lined);
    expect(store.getState().past.length).toBe(steps);
    // Left again: lined up already.
    await user.click(screen.getByRole('button', { name: 'Left' }));
    expect(screen.getByText('They are lined up on the left-most one already.')).toBeTruthy();
    // Each button says what it lines up to.
    await user.hover(screen.getByRole('button', { name: 'Right' }));
    expect(await screen.findByText('Line them up on the right-most one')).toBeTruthy();
  });

  it('keeps the Line up status in the page, empty, and clears it whenever the selection changes', async () => {
    const { store } = setup();
    const user = userEvent.setup();
    act(() => store.getState().select({ variables: ['a', 'b'] }));
    // There before any press, so its first message is announced.
    expect(screen.getByRole('status', { name: 'Line up' }).textContent).toBe('');
    await user.click(screen.getByRole('button', { name: 'Left' }));
    await user.click(screen.getByRole('button', { name: 'Top' }));
    expect(screen.getByRole('status', { name: 'Line up' }).textContent).toMatch(/on top of each other/);
    // A link added to the selection clears it.
    act(() => store.getState().select({ variables: ['a', 'b'], links: ['L1'] }));
    expect(screen.getByRole('status', { name: 'Line up' }).textContent).toBe('');
    await user.click(screen.getByRole('button', { name: 'Top' }));
    expect(screen.getByRole('status', { name: 'Line up' }).textContent).toMatch(/on top of each other/);
    // So does another variable, and the message does not come back with the first selection.
    act(() => store.getState().select({ variables: ['a', 'c'] }));
    expect(screen.getByRole('status', { name: 'Line up' }).textContent).toBe('');
    act(() => store.getState().select({ variables: ['a', 'b'] }));
    expect(screen.getByRole('status', { name: 'Line up' }).textContent).toBe('');
  });

  it('frames the home view from the canvas', async () => {
    const { store, view } = setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Home view (not set)' }));
    await user.click(screen.getByRole('menuitem', { name: 'Frame the home view…' }));
    await user.click(screen.getByRole('button', { name: 'Set as the home view' }));
    expect(store.getState().project.layout.home).toEqual(homeFromView(view, { w: 1000, h: 700 }));
    expect(store.getState().past.at(-1)?.label).toMatch(
      /^Set the home view: centre \(\d+, \d+\), zoom [\d.]+\.$/,
    );
  });

  it('finds a variable by name and selects it', async () => {
    const { store } = setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Find' }));
    await user.type(screen.getByRole('combobox', { name: 'Find a variable' }), 'C');
    await user.click(screen.getByRole('option', { name: 'C' }));
    expect(store.getState().selection.variables).toEqual(['c']);
  });
});
