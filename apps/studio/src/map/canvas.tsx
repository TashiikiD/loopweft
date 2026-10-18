// The map, drawn for editing: the renderer's own geometry (positions, curves, glyphs and colours from
// @loopweft/render), in the project's theme, with a pan and a zoom of its own. Drag the background to move
// around, scroll to zoom; click a variable or a link to select it (Shift adds to the selection).
import type { Project } from '@loopweft/model';
import {
  buildGraph,
  type Graph,
  type GraphEdge,
  type GraphNode,
  shapeGlyph,
  themeTokens,
  themeVariables,
} from '@loopweft/render';
import {
  createElement,
  memo,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useStudio, useStudioStore } from '../context.tsx';
import type { Selection } from '../state/store.ts';
import { fitView, mapBounds, type Size, type View, zoomAt } from './view.ts';

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
const props = (attrs: Record<string, string | number>) => {
  const { class: className, ...rest } = attrs;
  return className === undefined ? rest : { ...rest, className };
};

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
      return {
        x: n.x - gap,
        y: n.y - ((lines.length - 1) * size * 1.15) / 2 + size * 0.35,
        anchor: 'end' as const,
        lines,
        size,
      };
    case 'right':
      return {
        x: n.x + gap,
        y: n.y - ((lines.length - 1) * size * 1.15) / 2 + size * 0.35,
        anchor: 'start' as const,
        lines,
        size,
      };
    default:
      return { x: n.x, y: n.y + gap + size * 0.9, anchor: 'middle' as const, lines, size };
  }
}

const Node = memo(function Node({
  node,
  selected,
  pinned,
}: {
  node: GraphNode;
  selected: boolean;
  pinned: boolean;
}) {
  return (
    <g
      className={`lw-node shape-${node.shape}${selected ? ' selected' : ''}${node.response ? ' response' : ''}`}
      data-node={node.id}
      transform={`translate(${node.x} ${node.y})`}
      style={{ '--c': node.colour } as React.CSSProperties}
    >
      <circle className="hit" r={node.r + 8} />
      {selected && <circle className="ring" r={node.r + 7} />}
      {shapeGlyph(node.shape, node.r).map((part, i) =>
        createElement(part.tag, { key: i, ...props(part.attrs) }, part.text),
      )}
      {pinned && <circle className="pin" cx={node.r * 0.9} cy={-node.r * 0.9} r={3.2} />}
    </g>
  );
});

const Edge = memo(function Edge({ edge, selected }: { edge: GraphEdge; selected: boolean }) {
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
      {edge.sign === '?' && (
        <text
          className="unknown-sign"
          x={edge.geom.mid.x}
          y={edge.geom.mid.y}
          textAnchor="middle"
          dominantBaseline="central"
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
type Gesture = { kind: 'pan'; x: number; y: number; view: View; moved: boolean } | null;

const select = (
  selection: Selection,
  kind: 'variables' | 'links',
  id: string,
  add: boolean,
): Partial<Selection> => {
  if (!add)
    return kind === 'variables'
      ? { variables: [id], links: [], loop: null }
      : { variables: [], links: [id], loop: null };
  const list = selection[kind];
  return { [kind]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id], loop: null };
};

export function Canvas() {
  const project = useStudio((s) => s.project);
  const selection = useStudio((s) => s.selection);
  const generation = useStudio((s) => s.generation);
  const store = useStudioStore();
  const graph = useGraph(project);
  const variables = useMemo(() => themeVariables(themeTokens(project)), [project]);
  const host = useRef<HTMLDivElement>(null);
  const size = useSize(host);
  const [view, setView] = useState<View | null>(null);
  const fitted = useRef(-1);
  const gesture = useRef<Gesture>(null);

  // A newly opened map is shown whole; a resized canvas keeps the same map point at its centre.
  const lastSize = useRef<Size | null>(null);
  useEffect(() => {
    if (!size || size.w === 0) return;
    const before = lastSize.current;
    lastSize.current = size;
    if (fitted.current !== generation) {
      fitted.current = generation;
      setView(fitView(mapBounds(graph), size));
      return;
    }
    if (before && (before.w !== size.w || before.h !== size.h)) {
      setView((v) =>
        v ? { k: v.k, dx: v.dx + (size.w - before.w) / 2, dy: v.dy + (size.h - before.h) / 2 } : v,
      );
    }
  }, [generation, size, graph]);

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

  const selectedVariables = useMemo(() => new Set(selection.variables), [selection.variables]);
  const selectedLinks = useMemo(() => new Set(selection.links), [selection.links]);

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!view || event.button !== 0) return;
    const target = event.target as Element;
    const node = target.closest('[data-node]')?.getAttribute('data-node');
    const edge = target.closest('[data-edge]')?.getAttribute('data-edge');
    const state = store.getState();
    if (node) {
      state.select(select(state.selection, 'variables', node, event.shiftKey));
      return;
    }
    if (edge) {
      state.select(select(state.selection, 'links', edge, event.shiftKey));
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { kind: 'pan', x: event.clientX, y: event.clientY, view, moved: false };
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g) return;
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    if (!g.moved && Math.hypot(dx, dy) < 3) return;
    g.moved = true;
    setView({ k: g.view.k, dx: g.view.dx + dx, dy: g.view.dy + dy });
  };

  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (g && !g.moved) store.getState().select({ variables: [], links: [], loop: null });
  };

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
        >
          <rect className="lw-canvas-bg" width="100%" height="100%" />
          <g transform={`translate(${view.dx} ${view.dy}) scale(${view.k})`}>
            <Halos graph={graph} />
            <g className="lw-edges">
              {[...graph.edges.values()].map((e) => (
                <Edge key={e.id} edge={e} selected={selectedLinks.has(e.id)} />
              ))}
            </g>
            <g className="lw-nodes">
              {[...graph.nodes.values()].map((n) => (
                <Node
                  key={n.id}
                  node={n}
                  selected={selectedVariables.has(n.id)}
                  pinned={project.layout.positions[n.id]?.pinned === true}
                />
              ))}
            </g>
            {view.k >= LABELS_FROM_ZOOM && <Labels graph={graph} k={view.k} />}
          </g>
        </svg>
      )}
      {empty && (
        <div className="lw-canvas-empty">
          <p>An empty map.</p>
          <p>Open a map, or start one from a template, under File.</p>
        </div>
      )}
      <div className="lw-canvas-tools">
        <button
          type="button"
          className="lw-canvas-tool"
          onClick={() => size && setView(fitView(mapBounds(graph), size))}
          aria-label="Show the whole map"
          title="Show the whole map"
        >
          Fit
        </button>
        {view && <span className="lw-canvas-zoom">{Math.round(view.k * 100)}%</span>}
      </div>
    </div>
  );
}
