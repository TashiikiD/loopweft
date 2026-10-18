// Converts the polycrisis presentation (PolycrisisPresentation, private; content/*.json and the assembled
// scene specs) into a .loopweft project: the example that ships with Loopweft.
//
// It keeps the map, its domains, roles, link mechanisms and evidence, every citation with its page, the
// sources with their full APA references, the layout, the named loops and the story's steps. It cleans up
// what was the presenter's own: the fake title page, the full scripts, the presenter's lines, and wording
// that addressed the room. The rules for that are data (POLYCRISIS_CLEANUP), so they can be reviewed in one
// place, and every rule must still match the deck: if the deck changes, the conversion stops instead of
// guessing. Nothing is invented: a value the deck does not have stays out.
import { loopPolarity } from '../loops.ts';
import {
  type CardIcon,
  type Citation,
  FORMAT,
  FORMAT_VERSION,
  type Group,
  LEVELS,
  type Level,
  type LevelLists,
  type Link,
  type Loop,
  type MapState,
  type Overlay,
  type PLACES,
  type Project,
  ProjectSchema,
  type Scene,
  type Source,
  type Step,
  type Variable,
} from '../schema.ts';
import { validateProject } from '../validate.ts';

// ----- The deck's shapes (the parts the converter reads) -----

interface SourcePage {
  source_id: string;
  page: number;
}

export interface DeckMap {
  title: string;
  epistemic_status: string;
  scope: string;
  source_documents: Record<string, unknown>;
  domains: Record<string, { label: string; colour: string }>;
  evidence_levels: Record<string, string>;
  edge_mechanisms: string[];
  nodes: {
    id: string;
    label: string;
    domain: string;
    definition: string;
    source_pages: SourcePage[];
    scale: string;
    role: string;
  }[];
  edges: {
    id: string;
    source: string;
    target: string;
    polarity: '+' | '-';
    mechanism: string;
    evidence: string;
    conditional: boolean;
    rationale: string;
    sources: SourcePage[];
  }[];
  feedback_loops: {
    id: string;
    title: string;
    nodes: string[];
    interpretation: string;
    source: SourcePage;
    caution: string;
    edge_ids: string[];
  }[];
  loop_definitions: {
    id: string;
    title: string;
    type: 'R' | 'B';
    edge_ids: string[];
    sources: SourcePage[];
    caution: string;
    archetype?: string;
  }[];
}

export interface DeckLayout {
  hub: { x: number; y: number; r: number };
  clusters: Record<
    string,
    { x?: number; y?: number; r?: number; label: string; labelAt?: { x: number; y: number } }
  >;
  nodes: Record<
    string,
    { x: number; y: number; label: string; labelPos?: 'above' | 'below' | 'left' | 'right' }
  >;
  bends?: Record<string, number>;
}

export interface DeckNarration {
  title: string;
  sources: Record<
    string,
    {
      citation?: string;
      apa: string;
      doi?: string;
      url?: string;
      claim?: string;
      license?: string;
      summary?: string;
      part_of?: string;
    }
  >;
  scenes: {
    id: string;
    target_seconds: number;
    guided: string[];
    key_facts: string[];
    tone?: string;
    sources: string[];
  }[];
}

interface CardItem {
  title: string;
  sub?: string;
}

export interface DeckVisuals {
  legend: { roles: { role: string; label: string }[]; source: SourcePage };
  title: { title: string; subtitle: string };
  mechanisms: { items: { id: string; title: string }[]; source: SourcePage };
  cards: Record<string, { title: string; items: CardItem[]; source?: string }>;
}

/** The deck's map state for one build (src/map/types.ts). */
type DeckMapState = Record<string, unknown> & {
  nodeBase?: Level;
  edgeBase?: Level;
  nodes?: Partial<Record<Level, string[]>>;
  edges?: Partial<Record<Level, string[]>>;
  camera?: { fit?: string[]; frame?: string; maxZoom?: number };
  sideEffects?: boolean;
  labels?: string;
  domainLabels?: boolean;
};

export interface DeckBuild {
  /** e.g. "S05.3". */
  key: string;
  id: string;
  label: string;
  cue: { at: number; text: string };
  extraCues: { at: number; text: string }[];
  caption?: 'hide';
  map?: DeckMapState;
  viz?: Record<string, unknown>;
}

export interface DeckScene {
  id: string;
  number: number;
  title: string;
  headline: string;
  overlay: 'card' | 'caption';
  builds: DeckBuild[];
}

/** Everything the converter reads from the deck. */
export interface PolycrisisDeck {
  map: DeckMap;
  layout: DeckLayout;
  narration: DeckNarration;
  visuals: DeckVisuals;
  /** src/map/graph.ts HUB_NODES: drawn larger. */
  hubNodes: string[];
  /** src/map/graph.ts buildGraph(): the bend the deck draws each link with, by link id. */
  bends: Record<string, number>;
  /** src/map/camera.ts FULL_CAMERA: the deck's whole-map view, set by hand. */
  camera: { cx: number; cy: number; zoom: number };
  /** The assembled deck (src/scenes/index.ts DECK): scenes and their builds, in order. */
  scenes: DeckScene[];
}

// ----- The clean-up, as data -----

export interface Cleanup {
  /** Builds left out entirely, by key. */
  dropBuilds: Record<string, string>;
  /** New step ids, by build key (when dropping a build leaves a gap). */
  renumber: Record<string, string>;
  /** Labels and cues rewritten, by build key: [deck text, new text]. */
  rewrite: Record<string, { label?: [string, string]; cue?: [string, string] }>;
  /** Speaker-note lines left out, by scene id: the start of each line. */
  dropNotes: Record<string, string[]>;
  /** Scenes whose "tone" note is left out. */
  dropTone: string[];
  /** Speaker-note lines reworded, by scene id: [deck line, new line]. Applies to tone, guided notes and key facts. */
  rewordNotes: Record<string, [string, string][]>;
  /**
   * Links whose curve is written into the layout as the deck draws it, because Loopweft's crossing refinement
   * would otherwise re-bend them (the example keeps the deck's curves; a test in @loopweft/layout checks that
   * the refinement then leaves every link alone).
   */
  deckBends: string[];
  /**
   * Sources corrected, by id: [deck text, new text] for the reference and the in-text label, each with the
   * reason. Only for a correction agreed at a checkpoint review, never a reformatting.
   */
  correctSources: Record<string, { apa?: [string, string]; label?: [string, string]; why: string }>;
  /** Words that must not appear anywhere in the result (compared in lower case). */
  banned: string[];
}

/** The clean-up of the real deck. Every entry must still match it, or the conversion stops. */
export const POLYCRISIS_CLEANUP: Cleanup = {
  dropBuilds: { 'S00.1': 'the fake title page' },
  renumber: { 'S00.2': '1' },
  rewrite: {
    'S00.2': {
      label: ['Title page · the real one', 'Title page'],
      cue: [
        'The real title page cuts in and the network blooms. Let the room react; start the clock as you press into Scene 1.',
        'The title page; the network blooms behind it.',
      ],
    },
    'S06.5': {
      label: ['Where the traps show up on our map', 'Where the traps show up on the map'],
      cue: [
        'Where the traps show up on our map (our reading): 12 of 14. No counterpart for existential technology (nuclear weapons) or biosphere disconnect (biosphere illiteracy).',
        'Where the traps show up on the map (an interpretive reading, not from the source): 12 of 14. No counterpart for existential technology (nuclear weapons) or biosphere disconnect (biosphere illiteracy).',
      ],
    },
    'S06.6': { label: ['Root traps on our map', 'Root traps on the map'] },
  },
  dropNotes: {
    S00: ['Untimed. The fake title page', "Don't acknowledge the switch", "The fake slide's"],
  },
  dropTone: ['S00'],
  // Notes that spoke to the talk's own audience, made to suit any audience.
  rewordNotes: {
    S01: [
      [
        'Open with familiar crises, not statistics; this room knows each one. Name the six words slowly.',
        'Open with familiar crises, not statistics. Name the six words slowly.',
      ],
    ],
    S03: [
      [
        'The map: a qualitative synthesis of 41 variables and 132 links, not a simulation. The class knows the notation; give the legend five seconds.',
        'The map: a qualitative synthesis of 41 variables and 132 links, not a simulation. For an audience that knows causal-loop notation, five seconds on the legend is enough.',
      ],
    ],
    S07: [
      [
        'The turn toward agency: warmer and more direct. Speak to the room as fellow practitioners.',
        'The turn toward agency: warmer and more direct. Speak to the audience as fellow practitioners.',
      ],
    ],
    S09: [
      [
        'Hope with honesty. Let the teal relief travel before you speak; name the trade-offs plainly, without deflating the room.',
        'Hope with honesty. Let the teal relief travel before you speak; name the trade-offs plainly, without deflating the audience.',
      ],
    ],
  },
  deckBends: ['E005', 'E015', 'E016', 'E017', 'E030', 'E041', 'E045', 'E059', 'E106', 'E116', 'E119', 'E131'],
  correctSources: {
    J: {
      apa: [
        'Søgaard Jørgensen, P., Jansen, R. E. V., Avila Ortega, D. I., Wang-Erlandsson, L., Donges, J. F., Österblom, H., Olsson, P., Nyström, M., Lade, S. J., Hahn, T., Folke, C., Peterson, G. D., & Crépin, A.-S. (2023). Evolution of the polycrisis: Anthropocene traps that challenge global sustainability. *Philosophical Transactions of the Royal Society B: Biological Sciences*, *379*(1893), Article 20220261. https://doi.org/10.1098/rstb.2022.0261',
        'Søgaard Jørgensen, P., Jansen, R. E. V., Avila Ortega, D. I., Wang-Erlandsson, L., Donges, J. F., Österblom, H., Olsson, P., Nyström, M., Lade, S. J., Hahn, T., Folke, C., Peterson, G. D., & Crépin, A.-S. (2024). Evolution of the polycrisis: Anthropocene traps that challenge global sustainability. *Philosophical Transactions of the Royal Society B: Biological Sciences*, *379*(1893), Article 20220261. https://doi.org/10.1098/rstb.2022.0261',
      ],
      label: ['Søgaard Jørgensen et al. (2023)', 'Søgaard Jørgensen et al. (2024)'],
      why: 'the year of its issue, 379(1893), January 2024, as APA 7 gives it (the deck had 2023, the year it was published online; agreed at the Phase 3 checkpoint review)',
    },
  },
  banned: [
    'fake title',
    'fake slide',
    'deadpan',
    'thrown together',
    '[>]',
    'this room',
    'the class knows',
    'to the room',
    'deflating the room',
  ],
};

// ----- Fixed choices -----

/** Role glyphs as the deck draws them (src/map/map-view.ts roleShape, src/viz/legend.ts roleGlyph). */
const ROLE_SHAPES: Record<string, 'rounded-square' | 'circle' | 'octagon' | 'ring'> = {
  stress: 'rounded-square',
  trigger: 'circle',
  crisis: 'octagon',
  intervention: 'ring',
};

/** Names for the deck's link mechanisms, and the descriptions its types give (src/data/types.ts). */
const MECHANISMS: Record<string, { name: string; description?: string }> = {
  common_stress: { name: 'Common stress' },
  cascade: { name: 'Cascade' },
  feedback: { name: 'Feedback' },
  intervention: { name: 'Intervention' },
  response: {
    name: 'Response',
    description: 'A pressure that prompts or weakens a response inside the system (closing balancing loops).',
  },
  side_effect: {
    name: 'Side-effect',
    description: 'A documented possible side-effect of a response, shown only where a step names it.',
  },
};

/** Card sets credit their source by name; these are the source ids they mean. */
const CARD_SOURCES: Record<string, string> = { 'Søgaard Jørgensen et al. 2023': 'J' };

/**
 * Card sets whose cards the deck drew with an icon instead of a number, in card order; later cards take the
 * last icon (src/viz/cards.ts depthGlyph: a broken link, a balancing loop, then roots).
 */
const CARD_SET_ICONS: Record<string, CardIcon[]> = { depth: ['broken-link', 'balancing', 'root'] };

/** The deck's icon for each way crises become entangled (src/viz/legend.ts mechanismGlyph). */
const MECHANISM_ICONS: Record<string, CardIcon> = {
  stress: 'common-stress',
  trigger: 'common-trigger',
  domino: 'domino',
  feedback: 'feedback',
};

/** The deck's own visuals for one talk, which stay in the deck (see the plan). */
export const ONE_OFF_VISUALS: ReadonlySet<string> = new Set([
  'decoy',
  'traps',
  'timeline',
  'whyNow',
  'landscape',
  'schematic',
  'counter',
  'cameo',
]);

/** The deck's fonts (its @fontsource dependencies). */
const FONTS = { heading: 'Fraunces', body: 'Inter' };

/** The deck's statement places, as Loopweft places. */
const STATEMENT_PLACES: Record<string, (typeof PLACES)[number]> = {
  center: 'center',
  bottom: 'bottom',
  'top-right': 'top-right',
  'lower-left': 'bottom-left',
};

// ----- Conversion -----

const cite = (sp: SourcePage): Citation => ({ source: sp.source_id, pages: String(sp.page) });

const rank = (level: Level) => LEVELS.indexOf(level);

/** The deck's level lists, each id kept once at its highest level (as the deck resolves them), in list order. */
function levelLists(
  base: Level | undefined,
  lists: Partial<Record<Level, string[]>> | undefined,
): LevelLists | undefined {
  const best = new Map<string, Level>();
  for (const level of LEVELS) {
    for (const id of lists?.[level] ?? []) {
      const seen = best.get(id);
      if (seen === undefined || rank(level) > rank(seen)) best.set(id, level);
    }
  }
  const out: LevelLists = {};
  if (base !== undefined) out.base = base;
  for (const level of LEVELS) {
    const ids = [...new Set(lists?.[level] ?? [])].filter((id) => best.get(id) === level);
    if (ids.length) out[level] = ids;
  }
  return Object.keys(out).length ? out : undefined;
}

const MAP_STATE_FIELDS = new Set([
  'show',
  'opacity',
  'camera',
  'nodeBase',
  'edgeBase',
  'nodes',
  'edges',
  'labels',
  'domainLabels',
  'labelText',
  'trends',
  'loops',
  'loopNames',
  'reveal',
  'pulses',
  'ambient',
  'sideEffects',
  'clusters',
  'minimap',
]);

function convertMapState(state: DeckMapState | undefined, sideEffects: string[], where: string): MapState {
  if (!state) return { show: false };
  for (const key of Object.keys(state)) {
    if (!MAP_STATE_FIELDS.has(key))
      throw new Error(`${where}: no conversion for the map state field "${key}"`);
  }
  const out: Record<string, unknown> = {};
  const copy = (from: string, to = from) => {
    if (state[from] !== undefined) out[to] = structuredClone(state[from]);
  };
  copy('show');
  copy('opacity');
  if (state.camera) {
    const { fit, frame, maxZoom, ...other } = state.camera;
    if (Object.keys(other).length)
      throw new Error(`${where}: unknown camera fields ${Object.keys(other).join(', ')}`);
    out.camera = {
      ...(fit ? { fit: [...fit] } : {}),
      // The deck's "core" frame (inside its trap ring) is a small, centred inset.
      ...(frame ? { frame: frame === 'core' ? 'inset' : frame } : {}),
      ...(maxZoom !== undefined ? { maxZoom } : {}),
    };
  }
  out.variables = levelLists(state.nodeBase, state.nodes);

  // Side-effect links: the deck hides them unless a build sets sideEffects, and then they take the base
  // level. Loopweft hides links of an optional type unless a step lists them, so list them.
  const listed = new Set(LEVELS.flatMap((level) => state.edges?.[level] ?? []));
  if (!state.sideEffects) {
    const named = sideEffects.filter((id) => listed.has(id));
    if (named.length)
      throw new Error(`${where}: side-effect links ${named.join(', ')} are lit without sideEffects`);
  }
  const edges = structuredClone(state.edges ?? {});
  const base = state.edgeBase ?? 'normal';
  if (state.sideEffects && base !== 'hidden') {
    const unnamed = sideEffects.filter((id) => !listed.has(id));
    if (unnamed.length) edges[base] = [...(edges[base] ?? []), ...unnamed];
  }
  out.links = levelLists(state.edgeBase, edges);

  if (state.labels === 'domains')
    throw new Error(`${where}: the deck's "domains" label mode has no conversion`);
  // The deck shows no labels unless asked; Loopweft's default is the labels in view.
  out.labels = state.labels ?? 'none';
  copy('domainLabels', 'categoryLabels');
  copy('labelText');
  copy('trends');
  copy('loops');
  copy('loopNames');
  copy('reveal');
  copy('pulses');
  copy('ambient');
  copy('clusters');
  copy('minimap');
  for (const key of Object.keys(out)) if (out[key] === undefined) delete out[key];
  return out as MapState;
}

interface Dropped {
  /** One-off visuals left out, by kind: the builds that showed them. */
  visuals: Map<string, string[]>;
}

function convertViz(
  viz: Record<string, unknown> | undefined,
  deck: PolycrisisDeck,
  key: string,
  dropped: Dropped,
): Overlay[] {
  const overlays: Overlay[] = [];
  for (const [kind, state] of Object.entries(viz ?? {})) {
    if (ONE_OFF_VISUALS.has(kind)) {
      dropped.visuals.set(kind, [...(dropped.visuals.get(kind) ?? []), key]);
      continue;
    }
    const s = state as Record<string, unknown>;
    switch (kind) {
      case 'title':
        // The talk's title and subtitle; the presenter, programme, course and university lines are left out.
        overlays.push({
          type: 'title',
          title: deck.visuals.title.title,
          subtitle: deck.visuals.title.subtitle,
        });
        break;
      case 'statement': {
        const { lines, style, place, kicker, ...other } = s as {
          lines: string[];
          style?: 'hero' | 'question' | 'closing' | 'title' | 'note';
          place?: string;
          kicker?: string;
        };
        if (Object.keys(other).length) throw new Error(`${key}: unknown statement fields`);
        const where = place === undefined ? undefined : STATEMENT_PLACES[place];
        if (place !== undefined && where === undefined)
          throw new Error(`${key}: unknown statement place ${place}`);
        overlays.push({
          type: 'statement',
          lines: [...lines],
          ...(kicker ? { kicker } : {}),
          ...(style ? { style } : {}),
          ...(where ? { place: where } : {}),
        });
        break;
      }
      case 'legend':
        overlays.push({ type: 'legend', citations: [cite(deck.visuals.legend.source)] });
        break;
      case 'cards': {
        const { set, active } = s as { set: string; active?: number[] };
        const cards = deck.visuals.cards[set];
        if (!cards) throw new Error(`${key}: unknown card set ${set}`);
        const source = cards.source === undefined ? undefined : CARD_SOURCES[cards.source];
        if (cards.source !== undefined && source === undefined)
          throw new Error(`${key}: unknown card source ${cards.source}`);
        const icons = CARD_SET_ICONS[set];
        overlays.push({
          type: 'cards',
          title: cards.title,
          items: cards.items.map((item, i) => ({
            title: item.title,
            ...(item.sub ? { sub: item.sub } : {}),
            ...(icons ? { icon: (icons[i] ?? icons[icons.length - 1]) as CardIcon } : {}),
          })),
          ...(active ? { active: [...active] } : {}),
          ...(source ? { citations: [{ source }] } : {}),
        });
        break;
      }
      case 'mechanisms': {
        // The grammar of crisis interactions: four named mechanisms with their icons, one lit. In Loopweft,
        // cards in a compact grid at the top right, where the deck's panel sat (the map below shows the whole
        // network).
        const { active } = s as { active: string };
        const items = deck.visuals.mechanisms.items;
        const index = items.findIndex((m) => m.id === active);
        if (index < 0) throw new Error(`${key}: unknown mechanism ${active}`);
        overlays.push({
          type: 'cards',
          items: items.map((m) => {
            const icon = MECHANISM_ICONS[m.id];
            if (!icon) throw new Error(`${key}: no icon for the mechanism ${m.id}`);
            return { title: m.title, icon };
          }),
          active: [index],
          place: 'top-right',
          citations: [cite(deck.visuals.mechanisms.source)],
        });
        break;
      }
      default:
        throw new Error(`${key}: no conversion for the visual "${kind}"`);
    }
  }
  return overlays;
}

/** Speaker notes in Markdown: the tone, the guided notes and the key facts. */
function notesFor(
  scene: DeckNarration['scenes'][number],
  cleanup: Cleanup,
  used: Set<string>,
): string | undefined {
  const dropped = cleanup.dropNotes[scene.id] ?? [];
  const keep = (line: string) => {
    const rule = dropped.find((start) => line.startsWith(start));
    if (rule) used.add(`note ${scene.id} ${rule}`);
    return !rule;
  };
  const reworded = cleanup.rewordNotes[scene.id] ?? [];
  const reword = (line: string) => {
    const rule = reworded.find(([deck]) => deck === line);
    if (!rule) return line;
    used.add(`reword ${scene.id} ${rule[0]}`);
    return rule[1];
  };
  const guided = scene.guided.filter(keep).map(reword);
  const facts = scene.key_facts.filter(keep).map(reword);
  let tone = scene.tone === undefined ? undefined : reword(scene.tone);
  if (cleanup.dropTone.includes(scene.id)) {
    used.add(`tone ${scene.id}`);
    tone = undefined;
  }
  const parts = [
    ...(tone ? [`Tone: ${tone}`] : []),
    ...(guided.length ? [guided.map((g) => `- ${g}`).join('\n')] : []),
    ...(facts.length ? [`Key facts:\n${facts.map((f) => `- ${f}`).join('\n')}`] : []),
  ];
  return parts.length ? parts.join('\n\n') : undefined;
}

export interface Conversion {
  project: Project;
  /** What was left out or changed, one line each, for the record. */
  notes: string[];
}

export function convertPolycrisis(deck: PolycrisisDeck, cleanup: Cleanup = POLYCRISIS_CLEANUP): Conversion {
  const { map, layout, narration, visuals } = deck;
  const used = new Set<string>();

  // Nothing about a node may be dropped silently: every one is "global" in scale, which the map's scope
  // already says, so the field is left out.
  const scales = [...new Set(map.nodes.map((n) => n.scale))];
  if (scales.join() !== 'global')
    throw new Error(`Node scales are ${scales.join(', ')}; decide how to convert them`);
  for (const id of Object.keys(map.source_documents)) {
    if (!narration.sources[id]) throw new Error(`Source ${id} is in map.json but not in narration.json`);
  }

  const roles = visuals.legend.roles.map((r) => {
    const shape = ROLE_SHAPES[r.role];
    if (!shape) throw new Error(`No shape for the role ${r.role}`);
    // The deck's interventions: pulses into them read as relief, and relief walks leave them by "-" links.
    return { id: r.role, name: r.label, shape, ...(r.role === 'intervention' ? { response: true } : {}) };
  });
  const linkTypes = map.edge_mechanisms.map((id) => {
    const mechanism = MECHANISMS[id];
    if (!mechanism) throw new Error(`No name for the mechanism ${id}`);
    return {
      id,
      name: mechanism.name,
      ...(mechanism.description ? { description: mechanism.description } : {}),
      ...(id === 'side_effect' ? { style: 'dotted' as const, marker: 'flag' as const, optional: true } : {}),
    };
  });
  const sideEffects = map.edges.filter((e) => e.mechanism === 'side_effect').map((e) => e.id);

  const variables: Variable[] = map.nodes.map((n) => {
    const place = layout.nodes[n.id];
    if (!place) throw new Error(`layout.json has no position for ${n.id}`);
    return {
      id: n.id,
      label: n.label,
      ...(place.label !== n.label ? { mapLabel: place.label } : {}),
      category: n.domain,
      role: n.role,
      definition: n.definition,
      ...(deck.hubNodes.includes(n.id) ? { size: 'large' as const } : {}),
      citations: n.source_pages.map(cite),
    };
  });

  const links: Link[] = map.edges.map((e) => ({
    id: e.id,
    from: e.source,
    to: e.target,
    sign: e.polarity,
    type: e.mechanism,
    ...(e.conditional ? { conditional: true } : {}),
    rationale: e.rationale,
    fields: { evidence: e.evidence },
    citations: e.sources.map(cite),
  }));

  const edgeBetween = (from: string, to: string) =>
    map.edges.find((e) => e.source === from && e.target === to);
  const loops: Loop[] = [
    // The two-variable loops list their links unordered; order them as a chain, as the deck does.
    ...map.feedback_loops.map((l) => {
      const [a, b] = l.nodes as [string, string];
      const ab = edgeBetween(a, b);
      const ba = edgeBetween(b, a);
      if (!ab || !ba || [ab.id, ba.id].sort().join() !== [...l.edge_ids].sort().join()) {
        throw new Error(`Loop ${l.id}: its links do not run both ways between ${a} and ${b}`);
      }
      return {
        id: l.id,
        name: l.title,
        links: [ab.id, ba.id],
        description: l.interpretation,
        caution: l.caution,
        citations: [cite(l.source)],
      };
    }),
    ...map.loop_definitions.map((l) => ({
      id: l.id,
      name: l.title,
      links: [...l.edge_ids],
      ...(l.archetype ? { archetype: l.archetype } : {}),
      caution: l.caution,
      citations: l.sources.map(cite),
    })),
  ];

  const sources: Source[] = Object.entries(narration.sources).map(([id, s]) => {
    const doi = s.doi?.startsWith('https://doi.org/') ? s.doi.slice('https://doi.org/'.length) : s.doi;
    // A correction agreed at a review applies only while the deck still has the text it corrects.
    const fix = cleanup.correctSources[id];
    let apa = s.apa;
    let citation = s.citation;
    if (fix?.apa) {
      if (apa !== fix.apa[0]) throw new Error(`Source ${id}: the reference to correct has changed: ${apa}`);
      apa = fix.apa[1];
      used.add(`source ${id} apa`);
    }
    if (fix?.label) {
      if (citation !== fix.label[0])
        throw new Error(`Source ${id}: the label to correct has changed: ${citation}`);
      citation = fix.label[1];
      used.add(`source ${id} label`);
    }
    return {
      id,
      ...(citation ? { label: citation } : {}),
      apa,
      ...(doi ? { doi } : {}),
      ...(s.url ? { url: s.url } : {}),
      ...(s.license ? { licence: s.license } : {}),
      ...((s.summary ?? s.claim) ? { summary: s.summary ?? s.claim } : {}),
      ...(s.part_of ? { partOf: s.part_of } : {}),
    };
  });

  const groups: Group[] = [
    ...Object.entries(layout.clusters).map(([domain, c]) => ({
      id: domain,
      category: domain,
      label: c.label,
      ...(c.x !== undefined && c.y !== undefined ? { halo: { x: c.x, y: c.y, r: c.r ?? 160 } } : {}),
      ...(c.labelAt ? { labelAt: { ...c.labelAt } } : {}),
    })),
    // The faint glow at the centre of the map, where the story's pathways meet.
    { id: 'hub', halo: { ...layout.hub } },
  ];

  const dropped: Dropped = { visuals: new Map() };
  const scenes: Scene[] = deck.scenes.map((ds) => {
    const ns = narration.scenes.find((s) => s.id === ds.id);
    if (!ns) throw new Error(`Scene ${ds.id} is not in narration.json`);
    const untimed = ns.target_seconds === 0;
    const steps: Step[] = ds.builds.flatMap((b) => {
      if (cleanup.dropBuilds[b.key]) {
        used.add(`drop ${b.key}`);
        return [];
      }
      const rewrite = cleanup.rewrite[b.key];
      let label = b.label;
      let cue = [b.cue.text, ...b.extraCues.map((c) => c.text)].join(' ');
      if (rewrite?.label) {
        if (label !== rewrite.label[0])
          throw new Error(`${b.key}: the label to rewrite has changed: ${label}`);
        label = rewrite.label[1];
        used.add(`label ${b.key}`);
      }
      if (rewrite?.cue) {
        if (cue !== rewrite.cue[0]) throw new Error(`${b.key}: the cue to rewrite has changed: ${cue}`);
        cue = rewrite.cue[1];
        used.add(`cue ${b.key}`);
      }
      const id = cleanup.renumber[b.key] ?? b.id;
      if (cleanup.renumber[b.key]) used.add(`renumber ${b.key}`);
      const overlays = convertViz(b.viz, deck, b.key, dropped);
      if (ds.overlay === 'caption' && b.caption !== 'hide') overlays.push({ type: 'caption' });
      return [
        {
          id,
          label,
          ...(untimed ? {} : { at: b.cue.at }),
          cue,
          map: convertMapState(b.map, sideEffects, b.key),
          overlays,
        },
      ];
    });
    const notes = notesFor(ns, cleanup, used);
    return {
      id: ds.id,
      title: ds.title,
      headline: ds.headline,
      ...(untimed ? {} : { targetSeconds: ns.target_seconds }),
      ...(notes ? { notes } : {}),
      sources: [...ns.sources],
      steps,
    };
  });

  // Every clean-up rule must have matched something: a rule that no longer applies means the deck changed.
  const rules = [
    ...Object.keys(cleanup.dropBuilds).map((k) => `drop ${k}`),
    ...Object.keys(cleanup.renumber).map((k) => `renumber ${k}`),
    ...Object.entries(cleanup.rewrite).flatMap(([k, r]) => [
      ...(r.label ? [`label ${k}`] : []),
      ...(r.cue ? [`cue ${k}`] : []),
    ]),
    ...Object.entries(cleanup.dropNotes).flatMap(([scene, starts]) =>
      starts.map((s) => `note ${scene} ${s}`),
    ),
    ...cleanup.dropTone.map((s) => `tone ${s}`),
    ...Object.entries(cleanup.rewordNotes).flatMap(([scene, pairs]) =>
      pairs.map(([deck]) => `reword ${scene} ${deck}`),
    ),
    ...Object.entries(cleanup.correctSources).flatMap(([id, fix]) => [
      ...(fix.apa ? [`source ${id} apa`] : []),
      ...(fix.label ? [`source ${id} label`] : []),
    ]),
  ];
  const unused = rules.filter((r) => !used.has(r));
  if (unused.length) throw new Error(`Clean-up rules that no longer match the deck: ${unused.join('; ')}`);

  // Curves kept as the deck draws them (see Cleanup.deckBends).
  const keptBends: Record<string, number> = {};
  for (const id of cleanup.deckBends) {
    const bend = deck.bends[id];
    if (bend === undefined)
      throw new Error(`Clean-up rules that no longer match the deck: no link ${id} to keep`);
    keptBends[id] = bend;
  }

  const project = ProjectSchema.parse({
    format: FORMAT,
    version: FORMAT_VERSION,
    meta: { title: narration.title, description: `${map.epistemic_status} ${map.scope}` },
    theme: { base: 'cinematic-dark', fonts: FONTS },
    types: {
      categories: Object.entries(map.domains).map(([id, d]) => ({ id, name: d.label, colour: d.colour })),
      roles,
      linkTypes,
      fields: [
        {
          id: 'evidence',
          name: 'Evidence',
          kind: 'choice',
          appliesTo: 'links',
          options: Object.entries(map.evidence_levels).map(([id, description]) => ({
            id,
            name: id.charAt(0).toUpperCase() + id.slice(1),
            description,
          })),
        },
      ],
    },
    variables,
    links,
    layout: {
      positions: Object.fromEntries(
        Object.entries(layout.nodes).map(([id, n]) => [
          id,
          { x: n.x, y: n.y, ...(n.labelPos ? { labelSide: n.labelPos } : {}) },
        ]),
      ),
      groups,
      bends: { ...(layout.bends ?? {}), ...keptBends },
      // The deck's whole-map view, as its camera sets it.
      home: { x: deck.camera.cx, y: deck.camera.cy, zoom: deck.camera.zoom },
    },
    loops,
    sources,
    story: { scenes },
  });

  // The deck's loop types must agree with the signs.
  for (const l of map.loop_definitions) {
    const loop = project.loops.find((x) => x.id === l.id) as Loop;
    if (loopPolarity(project, loop) !== l.type)
      throw new Error(`Loop ${l.id} is marked ${l.type} but its signs disagree`);
  }

  const errors = validateProject(project).filter((i) => i.severity === 'error');
  if (errors.length)
    throw new Error(`The converted project is invalid:\n${errors.map((e) => e.message).join('\n')}`);
  const text = JSON.stringify(project).toLowerCase();
  const found = cleanup.banned.filter((word) => text.includes(word));
  if (found.length) throw new Error(`The converted project still contains: ${found.join(', ')}`);

  const notes = [
    ...Object.entries(cleanup.dropBuilds).map(([k, why]) => `Left out build ${k}: ${why}.`),
    ...Object.entries(cleanup.renumber).map(([k, id]) => `Step ${k} becomes step ${id} of its scene.`),
    ...Object.entries(cleanup.rewrite).map(
      ([k, r]) =>
        `Reworded the ${[r.label ? 'label' : '', r.cue ? 'cue' : ''].filter(Boolean).join(' and ')} of ${k}.`,
    ),
    ...Object.entries(cleanup.dropNotes).map(
      ([scene, starts]) =>
        `Left out ${starts.length} speaker-note line(s) of ${scene} about the fake title page and the presenter.`,
    ),
    ...cleanup.dropTone.map((scene) => `Left out the tone note of ${scene}.`),
    ...Object.entries(cleanup.correctSources).map(
      ([id, fix]) =>
        `Corrected the ${[fix.apa ? 'reference' : '', fix.label ? 'label' : ''].filter(Boolean).join(' and ')} of source ${id}: ${fix.why}.`,
    ),
    ...Object.entries(cleanup.rewordNotes).map(
      ([scene, pairs]) =>
        `Reworded ${pairs.length} speaker-note line(s) of ${scene} that addressed the talk's own audience.`,
    ),
    ...[...dropped.visuals].map(
      ([kind, keys]) => `Left out the one-off visual "${kind}" (it stays in the deck) on ${keys.join(', ')}.`,
    ),
    ...(cleanup.deckBends.length
      ? [
          `Kept the deck's curves for ${cleanup.deckBends.length} links that crossing refinement would re-bend: ${cleanup.deckBends.join(', ')}.`,
        ]
      : []),
    `Took the whole-map view from the deck's camera: centre (${deck.camera.cx}, ${deck.camera.cy}), zoom ${deck.camera.zoom}.`,
    'Title page: kept the title and subtitle; left out the presenter, programme, course and university lines.',
    'Left out: the full scripts and bridges, the fake title page, pathways, the Fig. 9 stages, the Anthropocene trap layer, the authoring rules, revision notes, node scale (all "global"), and source file names and notes.',
  ];
  return { project, notes };
}
