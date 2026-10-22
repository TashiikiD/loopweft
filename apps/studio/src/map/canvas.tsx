// The map, drawn for editing: the renderer's own geometry (positions, curves, glyphs and colours from
// @loopweft/render), in the project's theme, with a pan and a zoom of its own.
//
// - Drag the background to move around; scroll to zoom; Shift-drag the background to select an area.
// - Click a variable or a link to select it (Shift adds or takes away); drag variables to move them.
// - Double-click the background to add a variable there.
// - Drag from a variable's handle (the ring that shows on it) to another variable to link them; the sign
//   is asked, never assumed. Click an arrowhead to flip its link's sign.
// - Delete removes what is selected; Ctrl+F finds a variable; the home view is framed from here.
import { addLink, flipSign, type Link, moveVariables, type Project, setHome, setLink } from '@loopweft/model';
import {
  buildGraph,
  type Graph,
  type GraphEdge,
  type GraphNode,
  shapeGlyph,
  themeTokens,
  themeVariables,
} from '@loopweft/render';
import { Autocomplete, Button, Group, Menu, Paper, Text, TextInput } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import {
  createElement,
  memo,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useEdit, useStudio, useStudioStore } from '../context.tsx';
import { glyphProps } from '../glyph.tsx';
import type { Selection } from '../state/store.ts';
import {
  type Moves,
  placeVariable,
  previewMove,
  removalImpact,
  removalQuestion,
  removeSelection,
  rounded,
} from './edit.ts';
import { arrowheadTakesClick, CLEARLY_NEARER, nearestLink, nearestOtherLink } from './nearest.ts';
import {
  centreOn,
  type Frame,
  fitView,
  homeFromView,
  homeRect,
  mapBounds,
  type Size,
  stageFrame,
  toMap,
  type View,
  viewForHome,
  zoomAt,
} from './view.ts';

/** The drawable map of a project, rebuilt only when what it is drawn from changes. */
export function useGraph(project: Project): Graph {
  // biome-ignore lint/correctness/useExhaustiveDependencies: rebuilt from the parts it reads, not the whole project
  return useMemo(
    () => buildGraph(project),
    [project.variables, project.links, project.layout, project.types, project.theme],
  );
}

function useSize(ref: React.RefObject<HTMLElement | null>): Size | null {
  const [size, setSize] = useState<Size | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((old) => (old && old.w === r.width && old.h === r.height ? old : { w: r.width, h: r.height }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** Element attributes as React props: `class` becomes `className`. */
/**
 * Label size on screen: in proportion to the zoom, as the presentation's labels are to its stage (24 px at
 * the whole-map zoom of about 0.9), but never smaller than can be read nor larger than the Studio's text.
 */
export const labelPx = (k: number): number => Math.max(9, Math.min(15, 28 * k));

/** Below this zoom the labels would be too crowded to read, so they are left out. */
export const LABELS_FROM_ZOOM = 0.12;

/** Where a label goes beside its variable, in map units at zoom `k`. */
function labelPlace(n: GraphNode, k: number) {
  const gap = n.r + 6 / k;
  const size = labelPx(k) / k;
  const lines = n.label.split('\n');
  const middle = n.y - ((lines.length - 1) * size * 1.15) / 2 + size * 0.35;
  switch (n.labelSide) {
    case 'above':
      return {
        x: n.x,
        y: n.y - gap - (lines.length - 1) * size * 1.15 - size * 0.25,
        anchor: 'middle' as const,
        lines,
        size,
      };
    case 'left':
      return { x: n.x - gap, y: middle, anchor: 'end' as const, lines, size };
    case 'right':
      return { x: n.x + gap, y: middle, anchor: 'start' as const, lines, size };
    default:
      return { x: n.x, y: n.y + gap + size * 0.9, anchor: 'middle' as const, lines, size };
  }
}

const Node = memo(function Node({
  node,
  selected,
  pinned,
  target,
  k,
}: {
  node: GraphNode;
  selected: boolean;
  pinned: boolean;
  /** A link being drawn would end here. */
  target: boolean;
  k: number;
}) {
  return (
    <g
      className={`lw-node shape-${node.shape}${selected ? ' selected' : ''}${target ? ' target' : ''}${node.response ? ' response' : ''}`}
      data-node={node.id}
      transform={`translate(${node.x} ${node.y})`}
      style={{ '--c': node.colour } as React.CSSProperties}
    >
      <circle className="handle" data-handle={node.id} r={node.r + 9 / k} strokeWidth={7 / k}>
        <title>Drag to another variable to link them</title>
      </circle>
      <circle className="hit" r={node.r + 4 / k} />
      {(selected || target) && <circle className="ring" r={node.r + 5 / k} />}
      {shapeGlyph(node.shape, node.r).map((part, i) =>
        createElement(part.tag, { key: i, ...glyphProps(part.attrs) }, part.text),
      )}
      {pinned && <circle className="pin" cx={node.r * 0.9} cy={-node.r * 0.9} r={3.2} />}
    </g>
  );
});

const Edge = memo(function Edge({ edge, selected, k }: { edge: GraphEdge; selected: boolean; k: number }) {
  const sign = edge.sign === '+' ? 'plus' : edge.sign === '-' ? 'minus' : 'unknown';
  return (
    <g
      className={`lw-edge style-${edge.style}${edge.conditional ? ' conditional' : ''}${edge.optional ? ' optional' : ''}${selected ? ' selected' : ''}`}
      data-edge={edge.id}
      style={{ '--c': edge.colour } as React.CSSProperties}
    >
      <path className="hit" d={edge.geom.d} />
      <path className="line" d={edge.geom.d} />
      <path className={`head ${sign}`} d={edge.geom.head} />
      <circle className="head-hit" data-sign={edge.id} cx={edge.geom.p1.x} cy={edge.geom.p1.y} r={9 / k}>
        <title>{edge.sign === '?' ? 'Choose the sign' : 'Flip the sign'}</title>
      </circle>
      {edge.sign === '?' && (
        <text
          className="unknown-sign"
          x={edge.geom.mid.x}
          y={edge.geom.mid.y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={16 / k}
          strokeWidth={4 / k}
        >
          ?
        </text>
      )}
    </g>
  );
});

const Labels = memo(function Labels({ graph, k }: { graph: Graph; k: number }) {
  return (
    <g className="lw-labels">
      {[...graph.nodes.values()].map((n) => {
        const place = labelPlace(n, k);
        return (
          <text
            key={n.id}
            className="lw-label"
            x={place.x}
            y={place.y}
            textAnchor={place.anchor}
            fontSize={place.size}
            strokeWidth={3.5 / k}
          >
            {place.lines.map((line, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: lines of one label
              <tspan key={i} x={place.x} dy={i === 0 ? 0 : place.size * 1.15}>
                {line}
              </tspan>
            ))}
          </text>
        );
      })}
      {graph.groups.map((g) =>
        g.label && g.labelAt ? (
          <text
            key={g.id}
            className="lw-group-label"
            x={g.labelAt.x}
            y={g.labelAt.y}
            textAnchor="middle"
            fontSize={12 / k}
            style={{ '--c': g.colour ?? 'var(--lw-glow)' } as React.CSSProperties}
          >
            {g.label}
          </text>
        ) : null,
      )}
    </g>
  );
});

const Halos = memo(function Halos({ graph }: { graph: Graph }) {
  const colours = [...new Set(graph.groups.map((g) => g.colour ?? 'var(--lw-glow)'))];
  return (
    <>
      <defs>
        {colours.map((c, i) => (
          <radialGradient key={c} id={`lw-halo-${i}`}>
            <stop offset="0%" stopColor={c} stopOpacity={0.13} />
            <stop offset="100%" stopColor={c} stopOpacity={0} />
          </radialGradient>
        ))}
      </defs>
      {graph.groups.map((g) =>
        g.halo ? (
          <circle
            key={g.id}
            className="lw-halo"
            cx={g.halo.x}
            cy={g.halo.y}
            r={g.halo.r}
            fill={`url(#lw-halo-${colours.indexOf(g.colour ?? 'var(--lw-glow)')})`}
          />
        ) : null,
      )}
    </>
  );
});

/** What a pointer is doing on the canvas. */
type Gesture =
  | { kind: 'pan'; x: number; y: number; view: View; moved: boolean }
  | { kind: 'band'; x: number; y: number }
  | { kind: 'move'; ids: string[]; from: { x: number; y: number }; moved: boolean }
  | { kind: 'link'; from: string }
  | null;

const choose = (
  selection: Selection,
  kind: 'variables' | 'links',
  id: string,
  add: boolean,
): Partial<Selection> => {
  if (!add) {
    return kind === 'variables'
      ? { variables: [id], links: [], loop: null }
      : { variables: [], links: [id], loop: null };
  }
  const list = selection[kind];
  return { [kind]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id], loop: null };
};

/** A link waiting for its sign. */
interface PendingLink {
  from: string;
  to: string;
  /** Where to ask, on the canvas. */
  at: { x: number; y: number };
  /** An existing link whose sign is being chosen (its arrowhead was clicked), else a new link. */
  link?: string;
}

/** The three signs, as a person chooses them; + − ? on the keyboard too. */
function SignChooser({
  pending,
  onChoose,
  onCancel,
}: {
  pending: PendingLink;
  onChoose(sign: Link['sign']): void;
  onCancel(): void;
}) {
  useHotkeys([
    ['shift+equal', () => onChoose('+')],
    ['equal', () => onChoose('+')],
    ['minus', () => onChoose('-')],
    ['shift+slash', () => onChoose('?')],
    ['Escape', onCancel],
  ]);
  return (
    <Paper
      className="lw-floating"
      shadow="md"
      p="xs"
      withBorder
      style={{ left: pending.at.x, top: pending.at.y }}
      role="dialog"
      aria-label="The sign of the link"
    >
      <Text size="xs" c="dimmed" mb={6}>
        When the cause rises, the effect…
      </Text>
      <Group gap={6} wrap="nowrap">
        <Button size="compact-sm" onClick={() => onChoose('+')}>
          + rises too
        </Button>
        <Button size="compact-sm" color="orange" onClick={() => onChoose('-')}>
          − falls
        </Button>
        <Button size="compact-sm" variant="default" onClick={() => onChoose('?')}>
          ? not known
        </Button>
        <Button size="compact-sm" variant="subtle" color="gray" onClick={onCancel}>
          Cancel
        </Button>
      </Group>
    </Paper>
  );
}

/** The name of a new variable, asked where it was double-clicked. */
function NamePrompt({ at, onDone }: { at: { x: number; y: number }; onDone(name: string | null): void }) {
  const [name, setName] = useState('');
  const done = useRef(false);
  const finish = (value: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(value);
  };
  return (
    <Paper className="lw-floating" shadow="md" p={6} withBorder style={{ left: at.x, top: at.y }}>
      <TextInput
        size="xs"
        w={220}
        autoFocus
        aria-label="Name of the new variable"
        placeholder="Name of the new variable"
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') finish(name.trim() || null);
          if (event.key === 'Escape') finish(null);
        }}
        onBlur={() => finish(name.trim() || null)}
      />
    </Paper>
  );
}

/** With one link selected, + − ? set its sign from the keyboard. */
function SelectedLinkKeys({ id }: { id: string }) {
  const edit = useEdit();
  useHotkeys([
    ['shift+equal', () => edit((p) => setLink(p, id, { sign: '+' }))],
    ['equal', () => edit((p) => setLink(p, id, { sign: '+' }))],
    ['minus', () => edit((p) => setLink(p, id, { sign: '-' }))],
    ['shift+slash', () => edit((p) => setLink(p, id, { sign: '?' }))],
  ]);
  return null;
}

/** The canvas's pan and zoom, kept by the workspace while the table is shown. */
export interface CanvasMemory {
  generation: number;
  fit: number;
  view: View;
}

export function Canvas({ memory }: { memory?: { current: CanvasMemory | null } }) {
  const project = useStudio((s) => s.project);
  const selection = useStudio((s) => s.selection);
  const generation = useStudio((s) => s.generation);
  const fit = useStudio((s) => s.fit);
  const store = useStudioStore();
  const edit = useEdit();
  const graph = useGraph(project);
  const variables = useMemo(() => themeVariables(themeTokens(project)), [project]);
  const host = useRef<HTMLDivElement>(null);
  const size = useSize(host);
  // Coming back from the table, the canvas shows what it showed, unless a map was opened or the whole map
  // asked for (after an automatic layout) meanwhile.
  const kept =
    memory?.current?.generation === generation && memory.current.fit === fit ? memory.current : null;
  const [view, setView] = useState<View | null>(kept?.view ?? null);
  const fitted = useRef(kept ? `${generation}:${fit}` : '');
  useEffect(() => {
    if (memory && view) memory.current = { generation, fit, view };
  }, [memory, view, generation, fit]);
  const gesture = useRef<Gesture>(null);
  const [drag, setDrag] = useState<Moves | null>(null);
  const [band, setBand] = useState<Frame | null>(null);
  const [linking, setLinking] = useState<{
    from: string;
    to: { x: number; y: number };
    over: string | null;
  } | null>(null);
  const [pending, setPending] = useState<PendingLink | null>(null);
  const [naming, setNaming] = useState<{
    screen: { x: number; y: number };
    map: { x: number; y: number };
  } | null>(null);
  const [searching, setSearching] = useState(false);
  const [framing, setFraming] = useState(false);
  const [showHome, setShowHome] = useState(false);

  const shown = useMemo(() => (drag ? previewMove(graph, drag) : graph), [graph, drag]);

  // A newly opened map is shown whole, as is the map after an automatic layout; a resized canvas keeps the
  // same map point at its centre.
  const lastSize = useRef<Size | null>(null);
  useEffect(() => {
    if (!size || size.w === 0) return;
    const before = lastSize.current;
    lastSize.current = size;
    const key = `${generation}:${fit}`;
    if (fitted.current !== key) {
      fitted.current = key;
      setView(fitView(mapBounds(graph), size));
      setFraming(false);
      return;
    }
    if (before && (before.w !== size.w || before.h !== size.h)) {
      setView((v) =>
        v ? { k: v.k, dx: v.dx + (size.w - before.w) / 2, dy: v.dy + (size.h - before.h) / 2 } : v,
      );
    }
  }, [generation, fit, size, graph]);

  // Scrolling zooms about the pointer (a native listener, so the page itself does not scroll).
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const r = el.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.0016));
      setView((v) => (v ? zoomAt(v, event.clientX - r.left, event.clientY - r.top, factor) : v));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const removeSelected = () => {
    const { variables: vs, links: ls } = store.getState().selection;
    if (vs.length + ls.length === 0) return;
    const impact = removalImpact(store.getState().project, vs, ls);
    if ((impact.loops.length || impact.steps.length) && !window.confirm(removalQuestion(impact, vs.length)))
      return;
    edit((p) => removeSelection(p, vs, ls));
  };

  useHotkeys([
    ['Delete', removeSelected],
    ['Backspace', removeSelected],
    [
      'mod+A',
      () =>
        store.getState().select({
          variables: store.getState().project.variables.map((v) => v.id),
          links: [],
          loop: null,
        }),
    ],
    ['mod+F', () => setSearching(true)],
  ]);

  const selectedVariables = useMemo(() => new Set(selection.variables), [selection.variables]);
  const selectedLinks = useMemo(() => new Set(selection.links), [selection.links]);

  const local = (event: { clientX: number; clientY: number }) => {
    const r = (host.current as HTMLDivElement).getBoundingClientRect();
    return { x: event.clientX - r.left, y: event.clientY - r.top };
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!view || event.button !== 0 || pending || naming) return;
    const target = event.target as Element;
    const p = local(event);
    const state = store.getState();
    const handle = target.closest('[data-handle]')?.getAttribute('data-handle');
    if (handle) {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      gesture.current = { kind: 'link', from: handle };
      setLinking({ from: handle, to: toMap(view, p.x, p.y), over: null });
      return;
    }
    const curve = (id: string) => graph.edges.get(id)?.geom;
    const nearest = (fallback: string) =>
      nearestLink(
        document,
        event.clientX,
        event.clientY,
        '.lw-edge .hit',
        toMap(view, p.x, p.y),
        curve,
        fallback,
        CLEARLY_NEARER / view.k,
      );
    // An arrowhead flips its link's sign, unless another link's line passes nearer the pointer than the arrowhead
    // does (with no preference for the arrowhead's own link: a flip changes the map): the click is then on that
    // link, and selects it, changing nothing.
    const sign = target.closest('[data-sign]')?.getAttribute('data-sign');
    if (sign) {
      const at = toMap(view, p.x, p.y);
      const rival = nearestOtherLink(
        document,
        event.clientX,
        event.clientY,
        '.lw-edge .hit',
        at,
        curve,
        sign,
      );
      if (rival && !arrowheadTakesClick(at, curve(sign), rival)) {
        state.select(choose(state.selection, 'links', rival.id, event.shiftKey));
        return;
      }
      const link = state.project.links.find((l) => l.id === sign);
      if (!link) return;
      state.select({ variables: [], links: [link.id], loop: null });
      if (link.sign === '?') {
        setPending({ from: link.from, to: link.to, at: { x: p.x + 12, y: p.y + 12 }, link: link.id });
      } else edit((proj) => flipSign(proj, link.id));
      return;
    }
    const node = target.closest('[data-node]')?.getAttribute('data-node');
    if (node) {
      if (event.shiftKey) {
        state.select(choose(state.selection, 'variables', node, true));
        return;
      }
      const ids = state.selection.variables.includes(node) ? state.selection.variables : [node];
      if (!state.selection.variables.includes(node))
        state.select(choose(state.selection, 'variables', node, false));
      event.currentTarget.setPointerCapture?.(event.pointerId);
      gesture.current = { kind: 'move', ids, from: toMap(view, p.x, p.y), moved: false };
      return;
    }
    const hit = target.closest('[data-edge]')?.getAttribute('data-edge');
    if (hit) {
      // Where links run close, the one whose line is nearest the pointer, not the one drawn last.
      const edge = nearest(hit);
      state.select(choose(state.selection, 'links', edge, event.shiftKey));
      return;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    gesture.current = event.shiftKey
      ? { kind: 'band', x: p.x, y: p.y }
      : { kind: 'pan', x: event.clientX, y: event.clientY, view, moved: false };
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g || !view) return;
    const p = local(event);
    if (g.kind === 'pan') {
      const dx = event.clientX - g.x;
      const dy = event.clientY - g.y;
      if (!g.moved && Math.hypot(dx, dy) < 3) return;
      g.moved = true;
      setView({ k: g.view.k, dx: g.view.dx + dx, dy: g.view.dy + dy });
    } else if (g.kind === 'band') {
      setBand({
        x: Math.min(g.x, p.x),
        y: Math.min(g.y, p.y),
        w: Math.abs(p.x - g.x),
        h: Math.abs(p.y - g.y),
      });
    } else if (g.kind === 'move') {
      const at = toMap(view, p.x, p.y);
      const dx = at.x - g.from.x;
      const dy = at.y - g.from.y;
      if (!g.moved && Math.hypot(dx, dy) * view.k < 3) return;
      g.moved = true;
      const moves: Moves = {};
      for (const id of g.ids) {
        const n = graph.nodes.get(id);
        if (n) moves[id] = { x: n.x + dx, y: n.y + dy };
      }
      setDrag(moves);
    } else if (g.kind === 'link') {
      const under = document.elementFromPoint?.(event.clientX, event.clientY) ?? null;
      const over = under?.closest('[data-node]')?.getAttribute('data-node') ?? null;
      setLinking({ from: g.from, to: toMap(view, p.x, p.y), over: over && over !== g.from ? over : null });
    }
  };

  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || !view) return;
    const state = store.getState();
    if (g.kind === 'pan' && !g.moved) state.select({ variables: [], links: [], loop: null });
    if (g.kind === 'band') {
      const rect = band;
      setBand(null);
      if (rect && rect.w > 3 && rect.h > 3) {
        const a = toMap(view, rect.x, rect.y);
        const b = toMap(view, rect.x + rect.w, rect.y + rect.h);
        const inside = [...graph.nodes.values()]
          .filter((n) => n.x >= a.x && n.x <= b.x && n.y >= a.y && n.y <= b.y)
          .map((n) => n.id);
        const vs = new Set([...state.selection.variables, ...inside]);
        const ls = state.project.links.filter((l) => vs.has(l.from) && vs.has(l.to)).map((l) => l.id);
        state.select({
          variables: [...vs],
          links: [...new Set([...state.selection.links, ...ls])],
          loop: null,
        });
      }
    }
    if (g.kind === 'move') {
      const moves = drag;
      setDrag(null);
      if (g.moved && moves) edit((p) => moveVariables(p, rounded(moves)));
    }
    if (g.kind === 'link') {
      const done = linking;
      setLinking(null);
      if (done?.over) {
        const p = local(event);
        setPending({ from: g.from, to: done.over, at: { x: p.x + 12, y: p.y + 12 } });
      }
    }
  };

  const onDoubleClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!view) return;
    if ((event.target as Element).closest('[data-node],[data-edge]')) return;
    const p = local(event);
    setNaming({ screen: p, map: toMap(view, p.x, p.y) });
  };

  const chooseSign = (sign: Link['sign']) => {
    const wanted = pending;
    setPending(null);
    if (!wanted) return;
    if (wanted.link) {
      edit((p) => setLink(p, wanted.link as string, { sign }));
      return;
    }
    const out = edit((p) => addLink(p, { from: wanted.from, to: wanted.to, sign }));
    if (out) store.getState().select({ variables: [], links: [out.result.id], loop: null });
  };

  const find = (label: string) => {
    const v = project.variables.find((x) => x.label === label);
    setSearching(false);
    if (!v || !view || !size) return;
    store.getState().select({ variables: [v.id], links: [], loop: null });
    const n = graph.nodes.get(v.id);
    if (n) setView(centreOn({ ...view, k: Math.max(view.k, 0.8) }, size, n.x, n.y));
  };

  const home = project.layout.home;
  const frame = size ? stageFrame(size) : null;
  const linkFrom = linking ? shown.nodes.get(linking.from) : undefined;
  const empty = project.variables.length === 0;
  return (
    <div ref={host} className="lw-canvas" style={variables} data-theme={project.theme.base}>
      {view && (
        <svg
          role="img"
          aria-label={`The map: ${project.variables.length} variables and ${project.links.length} links`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onDoubleClick}
          className={linking ? 'linking' : undefined}
        >
          <rect className="lw-canvas-bg" width="100%" height="100%" />
          <g transform={`translate(${view.dx} ${view.dy}) scale(${view.k})`}>
            <Halos graph={shown} />
            {showHome && home && (
              <rect className="lw-home-rect" {...homeRect(home)} strokeWidth={1.5 / view.k}>
                <title>The home view</title>
              </rect>
            )}
            <g className="lw-edges">
              {[...shown.edges.values()].map((e) => (
                <Edge key={e.id} edge={e} selected={selectedLinks.has(e.id)} k={view.k} />
              ))}
            </g>
            {linkFrom && linking && (
              <line
                className="lw-link-draft"
                x1={linkFrom.x}
                y1={linkFrom.y}
                x2={linking.to.x}
                y2={linking.to.y}
                strokeWidth={2 / view.k}
              />
            )}
            <g className="lw-nodes">
              {[...shown.nodes.values()].map((n) => (
                <Node
                  key={n.id}
                  node={n}
                  selected={selectedVariables.has(n.id)}
                  pinned={project.layout.positions[n.id]?.pinned === true}
                  target={linking?.over === n.id}
                  k={view.k}
                />
              ))}
            </g>
            {view.k >= LABELS_FROM_ZOOM && <Labels graph={shown} k={view.k} />}
          </g>
          {band && <rect className="lw-band" x={band.x} y={band.y} width={band.w} height={band.h} />}
          {framing && frame && (
            <rect className="lw-stage-frame" x={frame.x} y={frame.y} width={frame.w} height={frame.h} />
          )}
        </svg>
      )}
      {empty && !naming && (
        <div className="lw-canvas-empty">
          <p>An empty map.</p>
          <p>Double-click to add a variable, or start from a template under File.</p>
          <p>
            Or ask an AI agent to build it:{' '}
            <button
              type="button"
              className="lw-link-button"
              onClick={() => store.getState().setAgentHelp(true)}
            >
              Work with an AI agent…
            </button>
          </p>
        </div>
      )}
      {naming && (
        <NamePrompt
          at={naming.screen}
          onDone={(name) => {
            const where = naming.map;
            setNaming(null);
            if (!name) return;
            const out = edit((p) => placeVariable(p, name, where));
            if (out) store.getState().select({ variables: [out.result.id], links: [], loop: null });
          }}
        />
      )}
      {pending && <SignChooser pending={pending} onChoose={chooseSign} onCancel={() => setPending(null)} />}
      {searching && (
        <Paper className="lw-floating lw-search" shadow="md" p={6} withBorder>
          <Autocomplete
            size="xs"
            w={260}
            autoFocus
            aria-label="Find a variable"
            placeholder="Find a variable"
            data={[...new Set(project.variables.map((v) => v.label))]}
            limit={12}
            onOptionSubmit={find}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setSearching(false);
            }}
            onBlur={() => setSearching(false)}
            comboboxProps={{ withinPortal: false }}
          />
        </Paper>
      )}
      {framing && (
        <Paper
          className="lw-floating lw-framing"
          shadow="md"
          p="xs"
          withBorder
          role="dialog"
          aria-label="Frame the home view"
        >
          <Text size="sm" mb={6} maw={360}>
            Move and zoom until the outline shows the whole map as the audience should see it.
          </Text>
          <Group gap={6}>
            <Button
              size="compact-sm"
              onClick={() => {
                if (view && size) edit((p) => setHome(p, homeFromView(view, size)));
                setFraming(false);
                setShowHome(true);
              }}
            >
              Set as the home view
            </Button>
            <Button size="compact-sm" variant="default" onClick={() => setFraming(false)}>
              Cancel
            </Button>
          </Group>
        </Paper>
      )}
      <div className="lw-canvas-tools">
        <button
          type="button"
          className="lw-canvas-tool"
          onClick={() => size && setView(fitView(mapBounds(graph), size))}
          title="Show the whole map"
        >
          Fit
        </button>
        <Menu position="top-start" withinPortal>
          <Menu.Target>
            <button type="button" className="lw-canvas-tool">
              Home view{home ? '' : ' (not set)'}
            </button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>
              {home ? `Centre ${home.x}, ${home.y}; zoom ${home.zoom}` : 'Fitted to the map'}
            </Menu.Label>
            <Menu.Item
              onClick={() => {
                if (size && home) setView(viewForHome(home, size));
                setFraming(true);
              }}
            >
              Frame the home view…
            </Menu.Item>
            <Menu.Item disabled={!home} onClick={() => size && home && setView(viewForHome(home, size))}>
              Go to the home view
            </Menu.Item>
            <Menu.Item disabled={!home} onClick={() => setShowHome((s) => !s)}>
              {showHome ? 'Hide' : 'Show'} its outline
            </Menu.Item>
            <Menu.Item disabled={!home} color="red" onClick={() => edit((p) => setHome(p, null))}>
              Clear: fit the map instead
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
        <button
          type="button"
          className="lw-canvas-tool"
          onClick={() => setSearching(true)}
          title="Find a variable (Ctrl+F)"
        >
          Find
        </button>
        {view && <span className="lw-canvas-zoom">{Math.round(view.k * 100)}%</span>}
      </div>
      {pending === null && linking === null && selection.links.length === 1 && (
        <SelectedLinkKeys id={selection.links[0] as string} />
      )}
    </div>
  );
}
