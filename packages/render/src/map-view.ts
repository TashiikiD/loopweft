// Source: PolycrisisPresentation src/map/map-view.ts @ 539bc8e (private), adapted for Loopweft: it tweens with
// @loopweft/motion instead of GSAP; colours, glyphs, groups, loops and responses come from the project (via
// the graph) and the theme; SVG ids are unique to each view, so several maps can share a page.
import {
  type Box,
  type Camera,
  cameraTransform,
  homeCamera,
  type LabelRequest,
  type LabelSide,
  placeLabels,
  quad,
  quadSegment,
  STAGE,
  project as toStage,
  wholeMapCamera,
} from '@loopweft/layout';
import type { Level, MapState, Project, Trend } from '@loopweft/model';
import { land, type Motion, type Props, Timeline } from '@loopweft/motion';
import { type AmbientSpec, ambientWalker, seededRandom } from './ambient.ts';
import { DRAW, type PulseBeat, type Schedule, schedule, TRAVEL } from './choreo.ts';
import { glyph, svg } from './dom.ts';
import { FLAG_MARK, LOOP_ARROW, shapeGlyph, TREND_GLYPH } from './glyphs.ts';
import {
  buildGraph,
  type Graph,
  type GraphGroup,
  type GraphNode,
  type LineStyle,
  positionsOf,
} from './graph.ts';
import { type NamedLoop, namedLoops } from './loops.ts';
import { MINIMAP_BOX, Minimap } from './minimap.ts';
import { type ResolvedMap, rank, resolveMap } from './resolve.ts';
import type { Transition } from './step.ts';

const EDGE_LABEL_WEIGHT: Partial<Record<Level, number>> = { normal: 0.6, focus: 3, active: 5 };
const NODE_OPACITY: Record<Level, number> = {
  hidden: 0,
  ghost: 0.13,
  dim: 0.32,
  normal: 0.88,
  focus: 1,
  active: 1,
};
const HALO_OPACITY: Record<Level, number> = {
  hidden: 0,
  ghost: 0,
  dim: 0,
  normal: 0,
  focus: 0.28,
  active: 0.75,
};
const EDGE_OPACITY: Record<Level, number> = {
  hidden: 0,
  ghost: 0.05,
  dim: 0.13,
  normal: 0.34,
  focus: 0.82,
  active: 1,
};
const EDGE_WIDTH: Record<Level, number> = {
  hidden: 1.6,
  ghost: 1.4,
  dim: 1.5,
  normal: 1.7,
  focus: 2.3,
  active: 3,
};
const CLUSTER_OPACITY = { show: 1, dim: 0.4, hide: 0 } as const;

const DURATIONS: Record<Transition, { fade: number; camera: number }> = {
  instant: { fade: 0, camera: 0 },
  quick: { fade: 0.4, camera: 0.6 },
  smooth: { fade: 0.8, camera: 1.25 },
};
/** Seconds the labels take to change when the category-in-words mode is switched. */
const WORDS_FADE = 0.3;

interface NodeEls {
  g: SVGGElement;
  halo: SVGCircleElement;
  trend: SVGGElement;
  trendBody: SVGGElement;
  trendGlyph: SVGPathElement;
}

interface EdgeEls {
  g: SVGGElement;
  line: SVGPathElement;
  head: SVGPathElement;
  flag: SVGGElement | null;
  conditional: boolean;
  style: LineStyle;
}

interface BadgeEls {
  g: SVGGElement;
  body: SVGGElement;
  arc: SVGPathElement;
  at: { x: number; y: number };
}

let views = 0;

const hidden = <T extends Element>(el: T): T => {
  (el as unknown as ElementCSSInlineStyle).style.opacity = '0';
  return el;
};

export interface MapViewOptions {
  project: Project;
  motion: Motion;
  /** The drawable map, if it is already built. */
  graph?: Graph;
}

/**
 * The persistent map. One SVG graph with stable positions; every step only changes emphasis, labels and the
 * camera, never the layout. A forward step can also play motion: new links trace in, pulses travel.
 */
export class MapView {
  graph: Graph;
  readonly loops: ReadonlyMap<string, NamedLoop>;
  readonly root: HTMLElement;
  readonly pulseLayer: SVGGElement;
  current: ResolvedMap | null = null;
  /** Stage regions that labels must keep clear of (captions, cards). */
  reserve: () => Box[] = () => [];

  readonly #project: Project;
  readonly #motion: Motion;
  readonly #prefix: string;
  readonly #svg: SVGSVGElement;
  readonly #defs: SVGDefsElement;
  readonly #camG: SVGGElement;
  readonly #edgeLayer: SVGGElement;
  readonly #badges = new Map<string, BadgeEls>();
  readonly #clusters: SVGCircleElement[] = [];
  readonly #nodes = new Map<string, NodeEls>();
  readonly #edges = new Map<string, EdgeEls>();
  readonly #labels = new Map<string, HTMLElement>();
  /** Each label's two lines: its text, and its category's name in the category-in-words mode. */
  readonly #labelLines = new Map<string, { text: HTMLElement; category: HTMLElement }>();
  /** The map state last applied, so the category-in-words mode can be switched without replaying it. */
  #state: MapState | undefined = undefined;
  #categoryWords = false;
  readonly #loopNames = new Map<string, HTMLElement>();
  /** Each loop badge's keyboard stop, saying what the loop is (the map's SVG is hidden from assistive technology). */
  readonly #loopKeys = new Map<string, HTMLElement>();
  /** The loops the step last applied shows. */
  #shownLoops = new Set<string>();
  readonly #groupLabels = new Map<string, { el: HTMLElement; group: GraphGroup }>();
  readonly #labelLayer: HTMLElement;
  readonly #minimap: Minimap;
  #cam: Camera;
  #camTween: Timeline | null = null;
  /** This step's choreography (traces, pulses); landed before the next step starts. */
  #running: Timeline | null = null;
  /** Walks in flight and the timer for the next one (a held step's idle motion). */
  readonly #ambientWalks = new Set<Timeline>();
  #ambientNext: Timeline | null = null;
  #ambientSeed = 1;
  #traceSeq = 0;

  constructor(host: HTMLElement, options: MapViewOptions) {
    this.#project = options.project;
    this.#motion = options.motion;
    this.graph = options.graph ?? buildGraph(options.project);
    this.loops = namedLoops(options.project, this.graph);
    this.#prefix = `lw${++views}`;
    this.#cam = wholeMapCamera(positionsOf(this.graph), homeCamera(options.project.layout));

    this.root = document.createElement('div');
    this.root.className = 'map';
    this.#svg = svg('svg', {
      class: 'map-svg',
      viewBox: `0 0 ${STAGE.w} ${STAGE.h}`,
      'aria-hidden': 'true',
    });
    this.#defs = this.#makeDefs();
    this.#svg.appendChild(this.#defs);
    this.#camG = svg('g', { class: 'map-camera' });
    const clusterLayer = svg('g', { class: 'map-clusters' });
    this.#edgeLayer = svg('g', { class: 'map-edges' });
    this.pulseLayer = svg('g', { class: 'map-pulses' });
    const nodeLayer = svg('g', { class: 'map-nodes' });
    const badgeLayer = svg('g', { class: 'map-badges' });
    this.#camG.append(clusterLayer, this.#edgeLayer, nodeLayer, this.pulseLayer, badgeLayer);
    this.#svg.appendChild(this.#camG);
    this.#labelLayer = document.createElement('div');
    this.#labelLayer.className = 'map-labels';
    this.root.append(this.#svg, this.#labelLayer);
    host.appendChild(this.root);

    // Group halos: a category's glow, or the theme's for a group without one (where pathways meet).
    for (const g of this.graph.groups) {
      if (!g.halo) continue;
      const fill = g.colour
        ? `url(#${this.#gradient('cluster', g.colour)})`
        : `url(#${this.#id('hub-glow')})`;
      this.#clusters.push(
        svg('circle', { cx: g.halo.x, cy: g.halo.y, r: g.halo.r, fill, class: 'map-cluster' }),
      );
    }
    clusterLayer.append(...this.#clusters);

    for (const e of this.graph.edges.values()) {
      const g = hidden(
        svg('g', {
          class: `edge style-${e.style}${e.flag ? ' flagged' : ''}`,
          'data-id': e.id,
        }),
      );
      g.style.setProperty('--c', e.colour);
      const line = svg('path', { d: e.geom.d, class: 'edge-line' });
      const sign = e.sign === '+' ? 'plus' : e.sign === '-' ? 'minus' : 'unknown';
      const head = svg('path', { d: e.geom.head, class: `edge-head ${sign}` });
      g.append(line, head);
      // A small flag marks a link of a flagged type (in the example, a documented possible side-effect).
      let flag: SVGGElement | null = null;
      if (e.flag) {
        flag = svg('g', {
          class: 'edge-flag',
          transform: `translate(${e.geom.mid.x.toFixed(1)} ${e.geom.mid.y.toFixed(1)})`,
        });
        flag.append(svg('circle', { r: 9 }), svg('path', { d: FLAG_MARK }));
        g.appendChild(flag);
      }
      this.#edgeLayer.appendChild(g);
      this.#edges.set(e.id, { g, line, head, flag, conditional: e.conditional, style: e.style });
    }

    for (const n of this.graph.nodes.values()) {
      const g = hidden(
        svg('g', {
          class: `node shape-${n.shape}${n.response ? ' response' : ''}`,
          'data-id': n.id,
          transform: `translate(${n.x} ${n.y})`,
        }),
      );
      g.style.setProperty('--c', n.colour);
      const halo = hidden(
        svg('circle', {
          r: (n.r * 3.4).toFixed(2),
          class: 'node-halo',
          fill: `url(#${this.#gradient('halo', n.colour)})`,
        }),
      );
      g.append(halo, ...glyph(shapeGlyph(n.shape, n.r)));
      const trend = hidden(svg('g', { class: 'node-trend', transform: `translate(${n.r + 6} ${-n.r - 6})` }));
      const trendBody = svg('g');
      const trendGlyph = svg('path', { d: '' });
      trendBody.append(svg('circle', { r: 9 }), trendGlyph);
      trend.appendChild(trendBody);
      g.appendChild(trend);
      nodeLayer.appendChild(g);
      this.#nodes.set(n.id, { g, halo, trend, trendBody, trendGlyph });

      const label = hidden(document.createElement('div'));
      label.className = `map-label pos-${n.labelSide}`;
      const text = document.createElement('span');
      text.className = 'map-label-text';
      text.textContent = n.label;
      const category = document.createElement('span');
      category.className = 'map-label-category';
      category.hidden = true;
      label.append(text, category);
      label.style.setProperty('--c', n.colour);
      this.#labelLayer.appendChild(label);
      this.#labels.set(n.id, label);
      this.#labelLines.set(n.id, { text, category });
    }

    for (const group of this.graph.groups) {
      if (!group.labelAt || !group.label) continue;
      const el = hidden(document.createElement('div'));
      el.className = 'map-group-label';
      el.textContent = group.label;
      el.style.setProperty('--c', group.colour ?? 'var(--lw-glow)');
      this.#labelLayer.appendChild(el);
      this.#groupLabels.set(group.id, { el, group });
    }

    for (const loop of this.loops.values()) {
      if (!loop.at) continue;
      const { x, y } = loop.at;
      const g = hidden(
        svg('g', {
          class: `loop-badge loop-${loop.type === '?' ? 'unknown' : loop.type}`,
          'data-id': loop.id,
          transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})`,
        }),
      );
      const body = svg('g');
      const text = svg('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central' });
      text.textContent = loop.type;
      const arc = svg('path', { d: LOOP_ARROW.arc, class: 'loop-arc' });
      body.append(
        svg('circle', { r: 21, class: 'loop-disc' }),
        arc,
        svg('path', { d: LOOP_ARROW.head, class: 'loop-head' }),
        text,
      );
      // Its id, name and archetype, for whoever points at it; a hidden badge takes no pointer (nor shows it).
      const detail = `${loop.id}: ${loop.name}${loop.archetype ? ` (${loop.archetype})` : ''}`;
      const tip = svg('title');
      tip.textContent = detail;
      g.append(tip, body);
      g.style.pointerEvents = 'none';
      badgeLayer.appendChild(g);
      this.#badges.set(loop.id, { g, body, arc, at: loop.at });

      // The same for the keyboard and screen readers: a stop over the badge while it shows, which says it.
      const key = document.createElement('div');
      key.className = 'map-loop-key';
      key.hidden = true;
      key.tabIndex = 0;
      key.setAttribute('role', 'img');
      key.setAttribute('aria-label', detail);
      key.dataset.detail = detail;
      this.#labelLayer.appendChild(key);
      this.#loopKeys.set(loop.id, key);

      // The loop's own name, not its archetype: two loops of one archetype must not read alike.
      const name = hidden(document.createElement('div'));
      name.className = `map-loop-name loop-${loop.type === '?' ? 'unknown' : loop.type}`;
      name.textContent = loop.name;
      this.#labelLayer.appendChild(name);
      this.#loopNames.set(loop.id, name);
    }

    this.#minimap = new Minimap(this.root, this.graph, this.#motion);
    this.#setCamera(this.#cam);
  }

  #id(name: string): string {
    return `${this.#prefix}-${name}`;
  }

  readonly #gradients = new Map<string, string>();

  /** A radial glow in `colour` (halo: a variable's; cluster: a group's), defined once per colour. */
  #gradient(kind: 'halo' | 'cluster', colour: string): string {
    const key = `${kind} ${colour}`;
    const known = this.#gradients.get(key);
    if (known) return known;
    const id = this.#id(`${kind}-${this.#gradients.size}`);
    this.#gradients.set(key, id);
    const g = svg('radialGradient', { id });
    g.append(
      svg('stop', { offset: '0%', 'stop-color': colour, 'stop-opacity': kind === 'halo' ? 0.55 : 0.11 }),
      svg('stop', { offset: '100%', 'stop-color': colour, 'stop-opacity': 0 }),
    );
    this.#defs.appendChild(g);
    return id;
  }

  #makeDefs(): SVGDefsElement {
    const defs = svg('defs');
    const glow = svg('radialGradient', { id: this.#id('hub-glow') });
    glow.append(
      svg('stop', { offset: '0%', style: 'stop-color: var(--lw-glow); stop-opacity: 0.07' }),
      svg('stop', { offset: '100%', style: 'stop-color: var(--lw-glow); stop-opacity: 0' }),
    );
    defs.appendChild(glow);
    // Pulse glows read their colour from the theme.
    for (const tone of ['harm', 'relief', 'mixed'] as const) {
      const g = svg('radialGradient', { id: this.#id(`pulse-${tone}`) });
      g.append(
        svg('stop', { offset: '0%', style: `stop-color: var(--lw-${tone}); stop-opacity: 0.85` }),
        svg('stop', { offset: '45%', style: `stop-color: var(--lw-${tone}); stop-opacity: 0.32` }),
        svg('stop', { offset: '100%', style: `stop-color: var(--lw-${tone}); stop-opacity: 0` }),
      );
      defs.appendChild(g);
    }
    return defs;
  }

  /** Moves to a step's map state. */
  apply(state: MapState | undefined, transition: Transition): ResolvedMap {
    const r = resolveMap(this.#project, this.graph, state, { categoryWords: this.#categoryWords });
    this.#state = state;
    const { fade, camera } = DURATIONS[transition];
    const prev = this.current;
    this.current = r;

    // Land the previous step's motion, so this one starts from a settled map.
    this.#running = land(this.#running);
    this.#stopAmbient();
    this.pulseLayer.replaceChildren();

    const plan = transition === 'smooth' && r.show ? schedule(this.graph, this.loops, prev, r, state) : null;
    const tl = plan ? new Timeline() : null;

    this.#tween(this.root, { opacity: r.show ? r.opacity : 0 }, fade);
    this.root.classList.toggle('is-hidden', !r.show);

    for (const el of this.#clusters) this.#tween(el, { opacity: CLUSTER_OPACITY[r.clusters] }, fade);

    for (const [id, level] of r.edgeLevel) {
      const els = this.#edges.get(id);
      if (!els) continue;
      const changed = !prev || prev.edgeLevel.get(id) !== level;
      if (!changed && transition !== 'instant') continue;
      els.line.style.strokeWidth = String(EDGE_WIDTH[level]);
      els.line.classList.toggle('dashed', els.conditional && rank(level) >= rank('focus'));
      els.g.classList.toggle('active', level === 'active');
      if (level === 'active' || level === 'focus') this.#edgeLayer.appendChild(els.g);
      const drawAt = plan?.draws.get(id);
      const fadeAt = plan?.fades.get(id);
      if (tl && drawAt !== undefined) {
        this.#traceIn(tl, id, els, EDGE_OPACITY[level], rank(level) >= rank('focus'), drawAt);
      } else if (tl && fadeAt !== undefined) {
        this.#motion.set(els.g, { opacity: 0 });
        tl.to(els.g, { opacity: EDGE_OPACITY[level] }, { duration: 0.6, ease: 'power1.out', at: fadeAt });
      } else {
        this.#tween(els.g, { opacity: EDGE_OPACITY[level] }, fade);
      }
    }

    for (const [id, level] of r.nodeLevel) {
      const els = this.#nodes.get(id);
      if (!els) continue;
      const at = plan?.nodeAt.get(id);
      if (tl && at !== undefined) {
        tl.to(els.g, { opacity: NODE_OPACITY[level] }, { duration: 0.55, ease: 'power2.out', at });
        tl.to(els.halo, { opacity: HALO_OPACITY[level] }, { duration: 0.55, ease: 'power2.out', at });
      } else {
        this.#tween(els.g, { opacity: NODE_OPACITY[level] }, fade);
        this.#tween(els.halo, { opacity: HALO_OPACITY[level] }, fade);
      }
      els.g.classList.toggle('active', level === 'active');
      this.#setTrend(id, els, prev, r, plan, tl, fade);
    }

    const shownLoops = new Set(r.loops);
    this.#shownLoops = shownLoops;
    this.#placeLoopKeys(this.#cam);
    for (const [id, b] of this.#badges) {
      const at = plan?.loopAt.get(id);
      const shown = shownLoops.has(id);
      b.g.style.pointerEvents = shown ? 'auto' : 'none';
      if (tl && at !== undefined && shown) this.#popBadge(tl, b, at);
      else this.#tween(b.g, { opacity: shown ? 1 : 0 }, fade);
    }
    const named = new Set(r.loopNames);
    for (const [id, el] of this.#loopNames) {
      const show = named.has(id) && shownLoops.has(id);
      const at = plan?.loopAt.get(id);
      if (tl && show && at !== undefined) {
        this.#motion.set(el, { opacity: 0 });
        tl.to(el, { opacity: 1 }, { duration: 0.5, at: at + 0.3 });
      } else this.#tween(el, { opacity: show ? 1 : 0 }, fade);
    }

    const hiddenGroups = this.#layoutLabels(r);
    for (const [id, el] of this.#labels) {
      const at = plan?.nodeAt.get(id);
      const target = r.labels.has(id) ? 1 : 0;
      if (tl && at !== undefined && target) {
        this.#motion.set(el, { opacity: 0 });
        tl.to(el, { opacity: 1 }, { duration: 0.6, ease: 'power2.out', at: at + 0.1 });
      } else this.#tween(el, { opacity: target }, fade);
    }
    for (const [id, { el }] of this.#groupLabels) {
      this.#tween(el, { opacity: r.categoryLabels && !hiddenGroups.has(id) ? 1 : 0 }, fade);
    }
    this.#minimap.setVisible(r.show && r.minimap, fade);

    if (tl && plan) {
      for (const beat of plan.pulses) this.#firePulse(tl, beat, r.camera.zoom);
      this.#running = this.#motion.play(tl);
    }

    this.#moveCamera(r.camera, camera);
    if (state?.ambient && r.show) {
      const after = Math.max(plan?.duration ?? 0, camera, fade) + 0.4 + (state.ambient.delay ?? 0);
      this.#startAmbient(state.ambient, r, after);
    }
    return r;
  }

  /** Ends a held step's idle walks: kills their timelines and the pending timer. */
  #stopAmbient(): void {
    this.#ambientNext?.kill();
    this.#ambientNext = null;
    for (const walk of this.#ambientWalks) walk.kill();
    this.#ambientWalks.clear();
  }

  /**
   * While a step is held, soft pulses wander the visible links at uneven intervals, each walk a few links
   * long. Every walk and timer plays through Motion, so Pause holds them; the next step stops them.
   */
  #startAmbient(spec: AmbientSpec, r: ResolvedMap, after: number): void {
    this.#ambientSeed = (this.#ambientSeed * 48271) % 2147483647;
    const walker = ambientWalker(this.graph, r, spec, seededRandom(this.#ambientSeed));
    if (!walker.ready) return;
    const launch = () => {
      const path = walker.walk() ?? [];
      if (path.length > 0) {
        const tl = new Timeline({ idle: true, onComplete: () => this.#ambientWalks.delete(tl) });
        path.forEach((edge, i) => {
          this.#firePulse(tl, { edge, at: i * TRAVEL * 1.3, tone: spec.tone }, r.camera.zoom, true);
        });
        this.#ambientWalks.add(tl);
        this.#motion.play(tl);
      }
      // A gap of 0 or less (from a project that was not checked) would call this again at once, without
      // end: the walks stop instead.
      const gap = walker.gap();
      this.#ambientNext = gap > 0 ? this.#motion.delayedCall(gap, launch, { idle: true }) : null;
    };
    this.#ambientNext = this.#motion.delayedCall(after, launch, { idle: true });
  }

  /** Shows, changes or clears a variable's ▲/▼/± badge; on a forward step it pops in when its pulse lands. */
  #setTrend(
    id: string,
    els: NodeEls,
    prev: ResolvedMap | null,
    r: ResolvedMap,
    plan: Schedule | null,
    tl: Timeline | null,
    fade: number,
  ): void {
    const trend: Trend | undefined = r.trends[id];
    const was = prev?.show ? prev.trends[id] : undefined;
    if (trend) {
      els.trend.setAttribute('class', `node-trend ${trend}`);
      els.trendGlyph.setAttribute('d', TREND_GLYPH[trend]);
    }
    const at = plan?.trendAt.get(id);
    if (tl && trend && at !== undefined && was !== trend) {
      this.#motion.set(els.trend, { opacity: 0 });
      this.#motion.set(els.trendBody, { scale: 0.2 });
      tl.to(els.trend, { opacity: 1 }, { duration: 0.2, ease: 'none', at });
      tl.to(els.trendBody, { scale: 1 }, { duration: 0.5, ease: 'back.out(2.4)', at });
    } else {
      this.#tween(els.trend, { opacity: trend ? 1 : 0 }, fade);
    }
  }

  /**
   * A newly lit link traces itself from source to target, its arrowhead arriving last. Dashed and dotted
   * links reveal through a growing mask so their pattern stays intact.
   */
  #traceIn(tl: Timeline, id: string, els: EdgeEls, opacity: number, lit: boolean, at: number): void {
    const geom = this.graph.edges.get(id)?.geom;
    if (!geom) return;
    const len = Math.max(1, geom.length);
    const patterned = els.style !== 'solid' || (els.conditional && lit);
    this.#motion.set(els.g, { opacity });
    this.#motion.set(els.head, { opacity: 0 });
    if (els.flag) this.#motion.set(els.flag, { opacity: 0 });
    if (patterned) {
      const maskId = this.#id(`trace-${++this.#traceSeq}`);
      const mask = svg('mask', {
        id: maskId,
        maskUnits: 'userSpaceOnUse',
        x: -4000,
        y: -4000,
        width: 10000,
        height: 10000,
      });
      const reveal = svg('path', {
        d: geom.d,
        fill: 'none',
        stroke: '#fff',
        'stroke-width': 18,
        'stroke-linecap': 'round',
      });
      reveal.style.strokeDasharray = `${len} ${len}`;
      reveal.style.strokeDashoffset = String(len);
      mask.appendChild(reveal);
      this.#defs.appendChild(mask);
      els.line.setAttribute('mask', `url(#${maskId})`);
      tl.to(
        reveal,
        { strokeDashoffset: 0 },
        {
          duration: DRAW,
          ease: 'power2.inOut',
          at,
          onComplete: () => {
            els.line.removeAttribute('mask');
            mask.remove();
          },
        },
      );
    } else {
      els.line.style.strokeDasharray = `${len} ${len}`;
      els.line.style.strokeDashoffset = String(len);
      tl.to(
        els.line,
        { strokeDashoffset: 0 },
        {
          duration: DRAW,
          ease: 'power2.inOut',
          at,
          onComplete: () => {
            els.line.style.strokeDasharray = '';
            els.line.style.strokeDashoffset = '';
          },
        },
      );
    }
    tl.to(els.head, { opacity: 1 }, { duration: 0.22, ease: 'none', at: at + DRAW * 0.82 });
    if (els.flag) tl.to(els.flag, { opacity: 1 }, { duration: 0.35, at: at + DRAW * 0.5 });
  }

  /** A loop badge arrives: it grows in while its arrow sweeps round. */
  #popBadge(tl: Timeline, b: BadgeEls, at: number): void {
    const len = LOOP_ARROW.length;
    this.#motion.set(b.g, { opacity: 0 });
    this.#motion.set(b.body, { scale: 0.35 });
    b.arc.style.strokeDasharray = `${len} ${len}`;
    b.arc.style.strokeDashoffset = String(len);
    tl.to(b.g, { opacity: 1 }, { duration: 0.25, ease: 'none', at });
    tl.to(b.body, { scale: 1 }, { duration: 0.65, ease: 'back.out(1.9)', at });
    tl.to(
      b.arc,
      { strokeDashoffset: 0 },
      {
        duration: 0.8,
        ease: 'power2.out',
        at: at + 0.1,
        onComplete: () => {
          b.arc.style.strokeDasharray = '';
          b.arc.style.strokeDashoffset = '';
        },
      },
    );
  }

  /**
   * One pulse along one link: a glowing head with a short tail travels the link, the link glows while it
   * carries it, and a ring opens where it lands. A soft pulse (a held step's idle walk) is smaller, slower
   * and lights no link, so it never competes with the text.
   */
  #firePulse(tl: Timeline, beat: PulseBeat, zoom: number, soft = false): void {
    const e = this.graph.edges.get(beat.edge);
    const els = this.#edges.get(beat.edge);
    if (!e || !els) return;
    const { p0, c, p1 } = e.geom;
    const k = (1 / Math.max(0.2, zoom)) * (soft ? 0.8 : 1);
    const travel = soft ? TRAVEL * 1.35 : TRAVEL;
    const g = hidden(svg('g', { class: `pulse tone-${beat.tone}${soft ? ' soft' : ''}` }));
    const trail = svg('path', { class: 'pulse-trail', 'stroke-width': (5.5 * k).toFixed(2) });
    const glow = svg('circle', {
      class: 'pulse-glow',
      r: (28 * k).toFixed(2),
      fill: `url(#${this.#id(`pulse-${beat.tone}`)})`,
    });
    const head = svg('circle', {
      class: 'pulse-head',
      r: (7.5 * k).toFixed(2),
      'stroke-width': (2 * k).toFixed(2),
    });
    g.append(trail, glow, head);
    const proxy = { t: 0 };
    const place = () => {
      const pt = quad(p0, c, p1, proxy.t);
      for (const dot of [glow, head]) {
        dot.setAttribute('cx', pt.x.toFixed(1));
        dot.setAttribute('cy', pt.y.toFixed(1));
      }
      const [a, cc, b] = quadSegment(p0, c, p1, Math.max(0, proxy.t - 0.34), proxy.t);
      trail.setAttribute(
        'd',
        `M${a.x.toFixed(1)} ${a.y.toFixed(1)}Q${cc.x.toFixed(1)} ${cc.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
      );
    };
    tl.call(() => {
      proxy.t = 0;
      place();
      this.pulseLayer.appendChild(g);
      if (soft) return;
      els.g.classList.add('carrying');
      els.g.style.setProperty('--tone', `var(--lw-${beat.tone})`);
    }, beat.at);
    tl.to(g, { opacity: soft ? 0.85 : 1 }, { duration: 0.12, ease: 'none', at: beat.at });
    tl.to(
      proxy,
      { t: 1 },
      { duration: travel, ease: soft ? 'sine.inOut' : 'power1.inOut', at: beat.at, onUpdate: place },
    );
    tl.to(
      g,
      { opacity: 0 },
      {
        duration: 0.2,
        ease: 'none',
        at: beat.at + travel - 0.06,
        onComplete: () => {
          g.remove();
          els.g.classList.remove('carrying');
        },
      },
    );
    this.#landing(tl, e.target, beat.tone, beat.at + travel - 0.1, k);
  }

  /** Where a pulse lands, a thin ring opens out and the variable's halo flares briefly. */
  #landing(tl: Timeline, node: GraphNode, tone: string, at: number, k: number): void {
    const ring = hidden(
      svg('circle', {
        class: `pulse-ring tone-${tone}`,
        cx: node.x,
        cy: node.y,
        r: node.r + 2,
        'stroke-width': (3.2 * k).toFixed(2),
      }),
    );
    tl.call(() => this.pulseLayer.appendChild(ring), at);
    tl.fromTo(
      ring,
      { attr: { r: node.r + 2 }, opacity: 0.95 },
      { attr: { r: node.r + 46 * k }, opacity: 0 },
      { duration: 0.9, ease: 'power2.out', at, onComplete: () => ring.remove() },
    );
    const els = this.#nodes.get(node.id);
    if (!els) return;
    const level = this.current?.nodeLevel.get(node.id) ?? 'normal';
    tl.to(els.halo, { opacity: 0.95 }, { duration: 0.16, ease: 'power1.out', at });
    tl.to(els.halo, { opacity: HALO_OPACITY[level] }, { duration: 0.9, ease: 'power2.inOut', at: at + 0.16 });
  }

  /**
   * Picks a side for each visible label against the step's final camera, and reports the group labels that
   * would leave the stage or cover reserved regions.
   */
  #layoutLabels(r: ResolvedMap): Set<string> {
    const requests: LabelRequest[] = [];
    for (const [id, el] of this.#labels) {
      const node = this.graph.nodes.get(id);
      if (!node) continue;
      const text = r.labelText[id] ?? node.label;
      const lines = this.#labelLines.get(id);
      if (lines && lines.text.textContent !== text) lines.text.textContent = text;
      const category = r.categoryWords[id];
      if (lines) {
        lines.category.hidden = category === undefined;
        if (lines.category.textContent !== (category ?? '')) lines.category.textContent = category ?? '';
      }
      el.classList.toggle('word', id in r.labelText);
      if (!r.labels.has(id)) continue;
      requests.push({
        id,
        w: el.offsetWidth,
        h: el.offsetHeight,
        preferred: node.labelSide,
        priority: rank(r.nodeLevel.get(id)),
      });
    }
    const edges: Array<{ id: string; weight: number }> = [];
    for (const [id, level] of r.edgeLevel) {
      const weight = EDGE_LABEL_WEIGHT[level];
      if (weight) edges.push({ id, weight });
    }
    const nodes = [...r.nodeLevel].filter(([, l]) => rank(l) >= rank('dim')).map(([id]) => id);
    const reserved = [...this.reserve(), ...(r.show && r.minimap ? [MINIMAP_BOX] : [])];

    // Group labels that fit stay put; variable labels then work around them.
    const hiddenGroups = new Set<string>();
    const groupBoxes: Box[] = [];
    for (const [id, { el, group }] of this.#groupLabels) {
      const at = group.labelAt as { x: number; y: number };
      const p = toStage(r.camera, at.x, at.y);
      const box = {
        x: p.x - el.offsetWidth / 2,
        y: p.y - el.offsetHeight / 2,
        w: el.offsetWidth,
        h: el.offsetHeight,
      };
      const offStage = box.x < 0 || box.y < 0 || box.x + box.w > STAGE.w || box.y + box.h > STAGE.h;
      const blocked = reserved.some(
        (b) => box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y,
      );
      if (offStage || blocked) hiddenGroups.add(id);
      else if (r.categoryLabels) groupBoxes.push(box);
    }

    const sides = placeLabels(requests, {
      graph: this.graph,
      camera: r.camera,
      edges,
      nodes,
      badges: Object.keys(r.trends),
      reserved: [...reserved, ...groupBoxes],
    });
    for (const [id, side] of sides) this.#setSide(id, side, id in r.labelText);
    return hiddenGroups;
  }

  #setSide(id: string, side: LabelSide, word: boolean): void {
    const el = this.#labels.get(id);
    if (el) el.className = `map-label pos-${side}${word ? ' word' : ''}`;
  }

  #tween(el: Element, props: Props, duration: number): void {
    if (duration <= 0) this.#motion.set(el, props);
    else this.#motion.to(el, props, { duration, ease: 'power2.out' });
  }

  #moveCamera(target: Camera, duration: number): void {
    this.#camTween?.kill();
    this.#camTween = null;
    if (duration <= 0) {
      this.#setCamera(target);
      return;
    }
    // Tween log(zoom) so zooming feels even, like a real camera move.
    const proxy = { cx: this.#cam.cx, cy: this.#cam.cy, lz: Math.log(this.#cam.zoom) };
    this.#camTween = this.#motion.to(
      proxy,
      { cx: target.cx, cy: target.cy, lz: Math.log(target.zoom) },
      {
        duration,
        ease: 'power2.inOut',
        onUpdate: () => this.#setCamera({ cx: proxy.cx, cy: proxy.cy, zoom: Math.exp(proxy.lz) }),
      },
    );
  }

  #setCamera(cam: Camera): void {
    this.#cam = cam;
    this.#camG.setAttribute('transform', cameraTransform(cam));
    for (const [id, el] of this.#labels) {
      const n = this.graph.nodes.get(id);
      if (!n) continue;
      const p = toStage(cam, n.x, n.y);
      el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      el.style.setProperty('--gap', `${(n.r * cam.zoom + 10).toFixed(1)}px`);
    }
    for (const { el, group } of this.#groupLabels.values()) {
      const at = group.labelAt as { x: number; y: number };
      const p = toStage(cam, at.x, at.y);
      el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    }
    for (const [id, el] of this.#loopNames) {
      const b = this.#badges.get(id);
      if (!b) continue;
      const p = toStage(cam, b.at.x, b.at.y);
      el.style.transform = `translate(${p.x.toFixed(1)}px, ${(p.y + 21 * cam.zoom + 8).toFixed(1)}px)`;
    }
    this.#placeLoopKeys(cam);
    this.#minimap.update(cam);
  }

  /** Puts each loop badge's keyboard stop over its badge, and out of reach while its badge is hidden or off the stage. */
  #placeLoopKeys(cam: Camera): void {
    for (const [id, el] of this.#loopKeys) {
      const b = this.#badges.get(id);
      if (!b) continue;
      const p = toStage(cam, b.at.x, b.at.y);
      // The badge's disc (radius 21).
      const d = 42 * cam.zoom;
      el.style.width = el.style.height = `${d.toFixed(1)}px`;
      el.style.transform = `translate(${(p.x - d / 2).toFixed(1)}px, ${(p.y - d / 2).toFixed(1)}px)`;
      el.hidden = !this.#shownLoops.has(id) || p.x < 0 || p.y < 0 || p.x > STAGE.w || p.y > STAGE.h;
    }
  }

  get camera(): Camera {
    return this.#cam;
  }

  /** Swaps in new positions and link shapes (when a layout is edited). */
  setGeometry(graph: Graph): void {
    this.graph = graph;
    for (const n of graph.nodes.values()) {
      this.#nodes.get(n.id)?.g.setAttribute('transform', `translate(${n.x} ${n.y})`);
    }
    for (const e of graph.edges.values()) {
      const els = this.#edges.get(e.id);
      if (!els) continue;
      els.line.setAttribute('d', e.geom.d);
      els.head.setAttribute('d', e.geom.head);
    }
    this.#setCamera(this.#cam);
  }

  /**
   * Names each shown variable's category in words, or stops (decision 22 of the format). The step is not
   * played again: only the labels change, the category lines fading in or out (0.3 s). While the motion is
   * paused (the presenter has stopped to explain), the change shows at once: a paused fade would never end.
   */
  setCategoryWords(on: boolean): void {
    if (this.#categoryWords === on) return;
    this.#categoryWords = on;
    if (!this.current) return;
    const r = resolveMap(this.#project, this.graph, this.#state, { categoryWords: on });
    this.current = r;
    const duration = this.#motion.paused ? 0 : WORDS_FADE;
    const showLabels = (hiddenGroups: Set<string>, fade: number) => {
      for (const [id, el] of this.#labels) this.#tween(el, { opacity: r.labels.has(id) ? 1 : 0 }, fade);
      for (const [id, { el }] of this.#groupLabels)
        this.#tween(el, { opacity: r.categoryLabels && !hiddenGroups.has(id) ? 1 : 0 }, fade);
    };
    if (on) {
      // Placed with the category lines in, which then fade in; a line hidden now shows at full strength
      // when a later step brings it up.
      const hiddenGroups = this.#layoutLabels(r);
      for (const { category } of this.#labelLines.values()) {
        this.#motion.set(category, { opacity: category.hidden ? 1 : 0 });
        if (!category.hidden) this.#tween(category, { opacity: 1 }, duration);
      }
      showLabels(hiddenGroups, duration);
      return;
    }
    // The lines fade out where they are; then they leave, and the labels are placed without them.
    for (const { category } of this.#labelLines.values())
      if (!category.hidden) this.#tween(category, { opacity: 0 }, duration);
    for (const [id, el] of this.#labels) if (!r.labels.has(id)) this.#tween(el, { opacity: 0 }, duration);
    const settle = () => {
      if (this.#categoryWords || this.current !== r) return;
      const hiddenGroups = this.#layoutLabels(r);
      for (const { category } of this.#labelLines.values()) this.#motion.set(category, { opacity: 1 });
      showLabels(hiddenGroups, 0);
    };
    if (duration === 0) settle();
    else this.#motion.delayedCall(duration, settle);
  }

  get categoryWords(): boolean {
    return this.#categoryWords;
  }

  /** Re-places labels for the current state (e.g. once web fonts have loaded). */
  relayout(): void {
    if (!this.current) return;
    const hiddenGroups = this.#layoutLabels(this.current);
    for (const [id, { el }] of this.#groupLabels) {
      this.#motion.set(el, { opacity: this.current.categoryLabels && !hiddenGroups.has(id) ? 1 : 0 });
    }
  }

  /** Stops this view's motion (its timelines keep their current state). */
  dispose(): void {
    this.#stopAmbient();
    this.#running?.kill();
    this.#camTween?.kill();
    this.root.remove();
  }
}
