// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ManualClock, Motion } from '@loopweft/motion';
import { describe, expect, it } from 'vitest';
import { MapView, StoryView, schedule, storyPositions } from '../src/index.ts';
import { example, stepAt } from './helpers.ts';

const project = example();

// A path, not a URL: under jsdom the global URL is jsdom's, which Node's file functions refuse.
const STYLESHEET = join(dirname(fileURLToPath(import.meta.url)), '../src/render.css');

/**
 * The stage's stylesheet in the document, each theme colour written out so that jsdom can resolve
 * `currentColor` through the cascade. Returns a function that takes it out again.
 */
function addStylesheet(colours: Record<string, string>): () => void {
  const style = document.createElement('style');
  style.textContent = readFileSync(STYLESHEET, 'utf8').replace(
    /var\(--lw-([a-z-]+)\)/g,
    (token, name: string) => colours[name] ?? token,
  );
  document.head.append(style);
  return () => style.remove();
}

function mapView() {
  const clock = new ManualClock();
  const motion = new Motion(clock);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const view = new MapView(host, { project, motion });
  return { clock, motion, host, view };
}

/** An element's inline opacity; unset reads as 1. */
const opacity = (el: Element | null | undefined) => {
  const value = (el as HTMLElement | null)?.style.opacity;
  if (value === undefined) return Number.NaN;
  return value === '' ? 1 : Number(value);
};
const q = (root: ParentNode, selector: string) => root.querySelector(selector);

describe('the map view', () => {
  it('draws every variable, link, loop badge and group halo, hidden until a step shows them', () => {
    const { host } = mapView();
    expect(host.querySelectorAll('.node')).toHaveLength(41);
    expect(host.querySelectorAll('.edge')).toHaveLength(132);
    expect(host.querySelectorAll('.loop-badge')).toHaveLength(18);
    expect(host.querySelectorAll('.map-cluster')).toHaveLength(7);
    expect(host.querySelectorAll('.map-label')).toHaveLength(41);
    expect(host.querySelectorAll('.edge.style-dotted.flagged .edge-flag')).toHaveLength(
      project.links.filter((l) => l.type === 'side_effect').length,
    );
    expect(host.querySelectorAll('.node.response .node-ring')).toHaveLength(5);
    for (const node of host.querySelectorAll('.node')) expect(opacity(node)).toBe(0);
  });

  it('gives each view its own SVG ids, so two maps can share a page', () => {
    const a = mapView().host;
    const b = mapView().host;
    const ids = (host: HTMLElement) => [...host.querySelectorAll('[id]')].map((el) => el.id);
    expect(ids(a).length).toBeGreaterThan(3);
    expect(ids(a).filter((id) => ids(b).includes(id))).toEqual([]);
  });

  it('shows a step at once: levels, labels and camera', () => {
    const { host, view } = mapView();
    const r = view.apply(stepAt(project, 'S04.2').map, 'instant');
    const node = (id: string) => q(host, `.node[data-id="${id}"]`);
    const levels = { hidden: 0, ghost: 0.13, dim: 0.32, normal: 0.88, focus: 1, active: 1 };
    for (const [id, level] of r.nodeLevel) expect(opacity(node(id)), id).toBe(levels[level]);
    expect(r.nodeLevel.get('geopolitical_conflict')).toBe('focus');
    expect(opacity(q(host, '.edge[data-id="E022"]'))).toBeGreaterThan(0.8);
    for (const [id, el] of [...host.querySelectorAll<HTMLElement>('.map-label')].map(
      (el, i) => [[...view.graph.nodes.keys()][i], el] as const,
    )) {
      expect(opacity(el), id).toBe(r.labels.has(id as string) ? 1 : 0);
    }
    expect(q(host, '.map-camera')?.getAttribute('transform')).toMatch(/^translate\(.+\) scale\(.+\)$/);
  });

  it('plays a forward step: the new link traces, a pulse travels it, the trend lands with it', () => {
    const { clock, host, view } = mapView();
    view.apply(stepAt(project, 'S04.1').map, 'instant');
    view.apply(stepAt(project, 'S04.2').map, 'smooth');
    // E022 is conditional, so it is dashed where lit: it traces through a growing mask, keeping its dashes.
    const line = q(host, '.edge[data-id="E022"] .edge-line') as SVGPathElement;
    expect(line.classList.contains('dashed')).toBe(true);
    expect(line.getAttribute('mask')).toMatch(/^url\(#lw\d+-trace-\d+\)$/);
    const trend = q(host, '.node[data-id="energy_price_shocks"] .node-trend');
    expect(opacity(trend)).toBe(0);
    clock.advance(2);
    expect(view.pulseLayer.querySelectorAll('.pulse').length).toBe(1);
    expect(q(host, '.edge[data-id="E022"]')?.classList.contains('carrying')).toBe(true);
    clock.advance(4);
    expect(line.hasAttribute('mask')).toBe(false);
    expect(host.querySelectorAll('mask')).toHaveLength(0);
    expect(opacity(trend)).toBe(1);
    expect(trend?.getAttribute('class')).toBe('node-trend up');
    expect(view.pulseLayer.childElementCount).toBe(0);
    expect(q(host, '.edge[data-id="E022"]')?.classList.contains('carrying')).toBe(false);
  });

  it('lands a step that is still moving before the next one starts', () => {
    const { clock, host, view } = mapView();
    view.apply(stepAt(project, 'S05.7').map, 'instant');
    view.apply(stepAt(project, 'S05.8').map, 'smooth');
    clock.advance(1.2);
    const masks = [...host.querySelectorAll('mask')].map((m) => m.id);
    expect(masks.length).toBeGreaterThan(0);
    view.apply(stepAt(project, 'S05.9').map, 'smooth');
    // Nothing of the landed step is left in flight: its trace masks are gone, and no pulse or ring remains.
    expect(masks.filter((id) => host.querySelector(`#${id}`))).toEqual([]);
    expect(view.pulseLayer.childElementCount).toBe(0);
    clock.advance(12);
    expect(view.pulseLayer.childElementCount).toBe(0);
    expect(host.querySelectorAll('mask')).toHaveLength(0);
  });

  it('pops new loop badges in once their loop has traced', () => {
    const { clock, host, view } = mapView();
    view.apply(stepAt(project, 'S05.1').map, 'instant');
    view.apply(stepAt(project, 'S05.2').map, 'smooth');
    const badge = q(host, '.loop-badge[data-id="R7"]');
    expect(opacity(badge)).toBe(0);
    clock.advance(5);
    expect(opacity(badge)).toBe(1);
  });

  it('keeps soft pulses wandering a held step, and stops them on the next step', () => {
    const { clock, view } = mapView();
    view.apply(stepAt(project, 'S00.1').map, 'instant');
    let seen = 0;
    for (let i = 0; i < 60; i++) {
      clock.advance(0.25);
      seen = Math.max(seen, view.pulseLayer.querySelectorAll('.pulse.soft').length);
    }
    expect(seen).toBeGreaterThan(0);
    view.apply(stepAt(project, 'S01.1').map, 'instant');
    expect(view.pulseLayer.childElementCount).toBe(0);
    clock.advance(10);
    expect(view.pulseLayer.childElementCount).toBe(0);
  });

  it('stops the walks of an unchecked step with no time between them, rather than calling itself forever', () => {
    const { clock, view } = mapView();
    const map = stepAt(project, 'S00.1').map;
    const ambient = map.ambient;
    if (!ambient) throw new Error('S00.1 has no ambient walks');
    view.apply({ ...map, ambient: { ...ambient, every: [0, 0] } }, 'instant');
    let seen = 0;
    expect(() => {
      for (let i = 0; i < 40; i++) {
        clock.advance(0.25);
        seen = Math.max(seen, view.pulseLayer.querySelectorAll('.pulse.soft').length);
      }
    }).not.toThrow();
    // The first walk goes; none follows it.
    expect(seen).toBeGreaterThan(0);
    expect(view.pulseLayer.childElementCount).toBe(0);
  });

  it('holds everything while paused, and lands it on skip', () => {
    const { clock, motion, host, view } = mapView();
    view.apply(stepAt(project, 'S04.1').map, 'instant');
    view.apply(stepAt(project, 'S04.2').map, 'smooth');
    motion.setPaused(true);
    const trend = q(host, '.node[data-id="energy_price_shocks"] .node-trend');
    clock.advance(10);
    expect(opacity(trend)).toBe(0);
    motion.landAll();
    expect(opacity(trend)).toBe(1);
  });

  it('agrees with the schedule on how long a step takes', () => {
    const { view } = mapView();
    const prev = view.apply(stepAt(project, 'S09.1').map, 'instant');
    const next = view.apply(stepAt(project, 'S09.2').map, 'smooth');
    const plan = schedule(view.graph, view.loops, prev, next, stepAt(project, 'S09.2').map);
    expect(plan.pulses.length).toBeGreaterThan(0);
    expect(plan.duration).toBeGreaterThan(2);
  });
});

describe('the story view', () => {
  it('plays the whole story forward and back without leaving anything behind', () => {
    const clock = new ManualClock();
    const motion = new Motion(clock);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const story = new StoryView(host, { project, motion });
    const positions = storyPositions(project);
    expect(positions).toHaveLength(70);
    expect(positions[3]?.key).toBe('S01.3');
    story.show(0, 0, 'instant');
    for (const p of positions.slice(1)) {
      story.show(p.scene, p.step, 'smooth');
      clock.advance(0.5);
    }
    for (const p of positions.slice(0, -1).reverse()) story.show(p.scene, p.step, 'quick');
    motion.landAll();
    expect(story.position).toEqual({ scene: 0, step: 0 });
    expect(host.querySelectorAll('.title-page')).toHaveLength(1);
    expect(host.querySelectorAll('.statement, .cards, .legend')).toHaveLength(0);
  });

  it('shows the scene caption, statements, cards and the legend where a step lists them', () => {
    const motion = new Motion(new ManualClock());
    const host = document.createElement('div');
    document.body.appendChild(host);
    const story = new StoryView(host, { project, motion });
    const at = (key: string) => {
      const p = storyPositions(project);
      const scene = project.story.scenes.findIndex((s) => s.id === key.split('.')[0]);
      const step = Number(key.split('.')[1]) - 1;
      expect(p.some((x) => x.scene === scene && x.step === step)).toBe(true);
      story.show(scene, step, 'instant');
    };
    at('S01.1');
    const caption = host.querySelector('.caption');
    expect(caption?.textContent).toContain('01 · ');
    expect(caption?.hasAttribute('data-reserve')).toBe(true);

    const kinds = (key: string) => {
      at(key);
      return stepAt(project, key).overlays.map((o) => o.type);
    };
    // Find steps that list each overlay type, and check each shows.
    for (const type of ['statement', 'cards', 'legend'] as const) {
      const key = storyPositions(project)
        .map((p) => `${project.story.scenes[p.scene]?.id}.${p.step + 1}`)
        .find((k) => stepAt(project, k).overlays.some((o) => o.type === type));
      expect(key, type).toBeDefined();
      expect(kinds(key as string)).toContain(type);
      const el = host.querySelector(`.overlay-${type} .${type === 'cards' ? 'cards' : type}`);
      expect(el, `${type} on ${key}`).not.toBeNull();
      expect(opacity(el)).not.toBe(0);
    }
  });

  it('stacks overlays in list order, under the caption', () => {
    const motion = new Motion(new ManualClock());
    const host = document.createElement('div');
    const story = new StoryView(host, { project, motion });
    story.overlays.apply(
      [
        { type: 'caption' },
        { type: 'statement', lines: ['First'] },
        { type: 'statement', lines: ['Second'] },
      ],
      { number: 1, title: 'Test' },
      'instant',
    );
    const layers = [...host.querySelectorAll<HTMLElement>('.overlay-statement')];
    expect(layers.map((l) => l.textContent)).toEqual(['First', 'Second']);
    expect(layers.map((l) => Number(l.style.zIndex))).toEqual([2, 3]);
  });

  it('sets cards beside the map as a column, and above or below it as a compact grid', () => {
    const motion = new Motion(new ManualClock());
    const host = document.createElement('div');
    const story = new StoryView(host, { project, motion });
    const items = [{ title: 'One' }, { title: 'Two' }];
    const show = (place?: 'left' | 'top-right' | 'bottom') =>
      story.overlays.apply(
        [{ type: 'cards', items, active: [1], ...(place ? { place } : {}) }],
        { number: 1, title: 'Test' },
        'instant',
      );
    show();
    expect(host.querySelector('.cards')?.className).toBe('cards place-left');
    show('top-right');
    expect(host.querySelector('.cards')?.className).toBe('cards place-top-right compact');
    // In a column the active card stands forward; in a grid it stays in line.
    const cards = [...host.querySelectorAll<HTMLElement>('.cd-card')];
    expect(cards.map((c) => c.style.transform)).toEqual(['', '']);
    expect(cards.map((c) => c.classList.contains('on'))).toEqual([false, true]);
    // The example keeps the four ways crises entangle at the top right (deck S03.7 is step S03.5).
    expect(
      stepAt(project, 'S03.7').overlays.find((o) => o.type === 'cards' && o.place === 'top-right'),
    ).toBeDefined();
  });

  it('shows a card’s icon in place of its number', () => {
    const motion = new Motion(new ManualClock());
    const host = document.createElement('div');
    const story = new StoryView(host, { project, motion });
    story.overlays.apply(
      [{ type: 'cards', items: [{ title: 'Break a link', icon: 'broken-link' }, { title: 'Numbered' }] }],
      { number: 1, title: 'Test' },
      'instant',
    );
    const [first, second] = [...host.querySelectorAll('.cd-card')];
    expect(first?.querySelector('svg.cd-icon.icon-broken-link path')).not.toBeNull();
    expect(first?.querySelector('.cd-index')).toBeNull();
    expect(second?.querySelector('.cd-index')?.textContent).toBe('02');

    // The example's panel of the ways crises become entangled carries the deck's four icons.
    const panel = stepAt(project, 'S03.7').overlays.find((o) => o.type === 'cards');
    expect(panel?.type === 'cards' && panel.items.map((i) => i.icon)).toEqual([
      'common-stress',
      'common-trigger',
      'domino',
      'feedback',
    ]);
  });

  it('mutes a compact card’s whole icon, its loop letter too, until the card is active', () => {
    const colours = { text: 'rgb(1, 1, 1)', muted: 'rgb(2, 2, 2)', glow: 'rgb(3, 3, 3)' };
    const removeStylesheet = addStylesheet(colours);
    const host = document.createElement('div');
    document.body.appendChild(host);
    try {
      const story = new StoryView(host, { project, motion: new Motion(new ManualClock()) });
      const items = [
        { title: 'Balancing', icon: 'balancing' as const },
        { title: 'Reinforcing', icon: 'reinforcing' as const },
      ];
      const show = (place: 'left' | 'top-right') =>
        story.overlays.apply(
          [{ type: 'cards', items, active: [1], place }],
          { number: 1, title: 'Test' },
          'instant',
        );
      /** Each icon's ring and letter colours, as the stylesheet resolves them. */
      const drawn = () =>
        [...host.querySelectorAll('.cd-icon')].map((icon) => [
          getComputedStyle(icon.querySelector('.ic-line') as Element).stroke,
          getComputedStyle(icon.querySelector('.ic-text') as Element).fill,
        ]);
      show('top-right');
      expect(drawn()).toEqual([
        [colours.muted, colours.muted],
        [colours.glow, colours.glow],
      ]);
      // A column keeps the deck's look: a glowing ring, and the letter in the text colour.
      show('left');
      expect(drawn()).toEqual([
        [colours.glow, colours.text],
        [colours.glow, colours.text],
      ]);
    } finally {
      host.remove();
      removeStylesheet();
    }
  });
});
