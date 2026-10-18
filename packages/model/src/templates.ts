// The templates a new map can start from: a blank map, and the eight classic system archetypes as
// structures. Each archetype is the causal loop diagram Kim and Anderson draw for it in "Systems Archetype
// Basics" (1998): its variables, with the generic names the book gives them, its links and their signs, its
// delays and its loops. The text that describes a template names that source; the variables carry no
// definitions and the links cite nothing, so a map made from a template cites only the evidence its author
// adds. Laid out by hand, roughly as the book's figures are.
import { createProject } from './project.ts';
import { type Link, type Project, ProjectSchema } from './schema.ts';

export interface Template {
  id: string;
  name: string;
  /** One neutral line for a gallery. */
  summary: string;
  build(): Project;
}

/** The book every archetype template follows. */
export const ARCHETYPE_SOURCE = {
  id: 'kim_anderson_1998',
  label: 'Kim and Anderson (1998)',
  apa: 'Kim, D. H., & Anderson, V. (1998). *Systems archetype basics: From story to structure*. Pegasus Communications.',
} as const;

type V = [id: string, label: string, x: number, y: number];
type L = [from: string, to: string, sign: Link['sign'], delay?: 'delay'];
type O = [id: string, name: string, links: number[]];

interface Archetype {
  id: string;
  name: string;
  /** What the book calls it, when that differs from the name. */
  bookName?: string;
  figure: string;
  summary: string;
  variables: V[];
  links: L[];
  /** Named loops: their link numbers (1 = first link), in order round the loop. */
  loops: O[];
}

const ARCHETYPES: Archetype[] = [
  {
    id: 'fixes-that-fail',
    name: 'Fixes that fail',
    figure: 'Figure 2.3',
    summary: 'A fix eases a problem symptom, and its unintended consequence brings the symptom back.',
    variables: [
      ['problem_symptom', 'Problem symptom', 700, 600],
      ['fix', 'Fix', 1200, 440],
      ['unintended_consequence', 'Unintended consequence', 1200, 800],
    ],
    links: [
      ['problem_symptom', 'fix', '+'],
      ['fix', 'problem_symptom', '-'],
      ['fix', 'unintended_consequence', '+', 'delay'],
      ['unintended_consequence', 'problem_symptom', '+'],
    ],
    loops: [
      ['B1', 'The fix reduces the symptom', [1, 2]],
      ['R2', 'The unintended consequence revives the symptom', [1, 3, 4]],
    ],
  },
  {
    id: 'shifting-the-burden',
    name: 'Shifting the burden',
    figure: 'Figure 3.2',
    summary:
      'A symptomatic solution eases a problem symptom, and its side-effect weakens the fundamental solution.',
    variables: [
      ['problem_symptom', 'Problem symptom', 760, 620],
      ['symptomatic_solution', 'Symptomatic solution', 1000, 380],
      ['fundamental_solution', 'Fundamental solution', 1000, 860],
      ['side_effect', 'Side-effect', 1300, 620],
    ],
    links: [
      ['problem_symptom', 'symptomatic_solution', '+'],
      ['symptomatic_solution', 'problem_symptom', '-'],
      ['problem_symptom', 'fundamental_solution', '+'],
      ['fundamental_solution', 'problem_symptom', '-', 'delay'],
      ['symptomatic_solution', 'side_effect', '+'],
      ['side_effect', 'fundamental_solution', '-'],
    ],
    loops: [
      ['B1', 'The symptomatic solution eases the symptom', [1, 2]],
      ['B2', 'The fundamental solution keeps the symptom from returning', [3, 4]],
      ['R3', 'The side-effect erodes the fundamental solution', [1, 5, 6, 4]],
    ],
  },
  {
    id: 'limits-to-growth',
    name: 'Limits to growth',
    bookName: 'Limits to success',
    figure: 'Figure 4.2',
    summary: 'Efforts raise performance, until a limiting action that grows with it slows it down.',
    variables: [
      ['efforts', 'Efforts', 600, 620],
      ['performance', 'Performance', 960, 620],
      ['limiting_action', 'Limiting action', 1320, 620],
      ['constraint', 'Constraint', 1320, 360],
    ],
    links: [
      ['efforts', 'performance', '+'],
      ['performance', 'efforts', '+'],
      ['performance', 'limiting_action', '+'],
      ['limiting_action', 'performance', '-'],
      ['constraint', 'limiting_action', '+'],
    ],
    loops: [
      ['R1', 'Performance encourages more efforts', [1, 2]],
      ['B2', 'The limiting action slows performance', [3, 4]],
    ],
  },
  {
    id: 'tragedy-of-the-commons',
    name: 'Tragedy of the commons',
    figure: 'Figure 9.2',
    summary:
      'Users of a shared resource each gain from more activity, until the total lowers the gain of every activity.',
    variables: [
      ['activity_a', "A's activity", 760, 380],
      ['net_gains_a', 'Net gains for A', 460, 500],
      ['activity_b', "B's activity", 760, 840],
      ['net_gains_b', 'Net gains for B', 460, 720],
      ['total_activity', 'Total activity', 1080, 610],
      ['gain_per_activity', 'Gain per individual activity', 1400, 610],
      ['resource_limit', 'Resource limit', 1700, 610],
    ],
    links: [
      ['activity_a', 'net_gains_a', '+'],
      ['net_gains_a', 'activity_a', '+'],
      ['activity_b', 'net_gains_b', '+'],
      ['net_gains_b', 'activity_b', '+'],
      ['activity_a', 'total_activity', '+'],
      ['activity_b', 'total_activity', '+'],
      ['total_activity', 'gain_per_activity', '-', 'delay'],
      ['gain_per_activity', 'net_gains_a', '+'],
      ['gain_per_activity', 'net_gains_b', '+'],
      ['gain_per_activity', 'activity_a', '-'],
      ['gain_per_activity', 'activity_b', '-'],
      ['resource_limit', 'gain_per_activity', '+'],
    ],
    loops: [
      ['R1', 'A gains from more activity', [1, 2]],
      ['R2', 'B gains from more activity', [3, 4]],
      ['R3', 'A steps up its activity as the gain per activity falls', [5, 7, 10]],
      ['R4', 'B steps up its activity as the gain per activity falls', [6, 7, 11]],
      ['B5', "The falling gain per activity cuts A's net gains", [5, 7, 8, 2]],
      ['B6', "The falling gain per activity cuts B's net gains", [6, 7, 9, 4]],
    ],
  },
  {
    id: 'escalation',
    name: 'Escalation',
    figure: 'Figure 8.4',
    summary: "Two parties each act against the threat of the other's results, raising each other's activity.",
    variables: [
      ['activity_a', 'Activity by A', 420, 610],
      ['result_a', "A's result", 690, 830],
      ['position_a', "Quality of A's position relative to B", 960, 610],
      ['threat_a', 'Threat to A', 690, 390],
      ['threat_b', 'Threat to B', 1230, 390],
      ['activity_b', 'Activity by B', 1500, 610],
      ['result_b', "B's result", 1230, 830],
    ],
    links: [
      ['activity_a', 'result_a', '+'],
      ['result_a', 'position_a', '+'],
      ['position_a', 'threat_a', '-'],
      ['threat_a', 'activity_a', '+'],
      ['position_a', 'threat_b', '+'],
      ['threat_b', 'activity_b', '+'],
      ['activity_b', 'result_b', '+'],
      ['result_b', 'position_a', '-'],
    ],
    loops: [
      ['B1', 'A acts to improve its position relative to B', [1, 2, 3, 4]],
      ['B2', 'B acts to improve its position relative to A', [5, 6, 7, 8]],
    ],
  },
  {
    id: 'success-to-the-successful',
    name: 'Success to the successful',
    figure: 'Figure 7.2',
    summary: 'Favouring A over B brings A success and B less, which favours A again.',
    variables: [
      ['allocation', 'Allocation to A instead of B', 960, 610],
      ['resources_a', 'Resources to A', 640, 400],
      ['success_a', 'Success of A', 640, 820],
      ['resources_b', 'Resources to B', 1280, 400],
      ['success_b', 'Success of B', 1280, 820],
    ],
    links: [
      ['allocation', 'resources_a', '+'],
      ['resources_a', 'success_a', '+'],
      ['success_a', 'allocation', '+'],
      ['allocation', 'resources_b', '-'],
      ['resources_b', 'success_b', '+'],
      ['success_b', 'allocation', '-'],
    ],
    loops: [
      ['R1', 'Resources to A bring A success, which brings A more', [1, 2, 3]],
      ['R2', 'Less for B brings B less success, which favours A', [4, 5, 6]],
    ],
  },
  {
    id: 'eroding-goals',
    name: 'Eroding goals',
    bookName: 'Drifting goals',
    figure: 'Figure 5.2',
    summary: 'A gap between a goal and the actual is closed by corrective action, or by lowering the goal.',
    variables: [
      ['goal', 'Goal', 1140, 360],
      ['gap', 'Gap', 960, 610],
      ['actual', 'Actual', 600, 610],
      ['corrective_action', 'Corrective action', 780, 860],
      ['pressure_to_lower_goal', 'Pressure to lower goal', 1320, 610],
    ],
    links: [
      ['goal', 'gap', '+'],
      ['actual', 'gap', '-'],
      ['gap', 'corrective_action', '+'],
      ['corrective_action', 'actual', '+', 'delay'],
      ['gap', 'pressure_to_lower_goal', '+'],
      ['pressure_to_lower_goal', 'goal', '-'],
    ],
    loops: [
      ['B1', 'Corrective action closes the gap', [3, 4, 2]],
      ['B2', 'Lowering the goal closes the gap', [5, 6, 1]],
    ],
  },
  {
    id: 'growth-and-underinvestment',
    name: 'Growth and underinvestment',
    figure: 'Figure 6.2',
    summary:
      'Growth strains capacity; investment in capacity, judged against a performance standard, comes late or not at all.',
    variables: [
      ['growth_efforts', 'Growth efforts', 440, 520],
      ['demand', 'Demand', 760, 520],
      ['limit_impact', 'Impact of limiting factor', 1080, 520],
      ['perceived_need', 'Perceived need to invest', 1400, 520],
      ['performance_standard', 'Performance standard', 1680, 380],
      ['investment', 'Investment in capacity', 1400, 840],
      ['capacity', 'Capacity', 1080, 840],
    ],
    links: [
      ['growth_efforts', 'demand', '+'],
      ['demand', 'growth_efforts', '+'],
      ['demand', 'limit_impact', '+'],
      ['limit_impact', 'demand', '-'],
      ['limit_impact', 'perceived_need', '+'],
      ['performance_standard', 'perceived_need', '+'],
      ['perceived_need', 'investment', '+', 'delay'],
      ['investment', 'capacity', '+', 'delay'],
      ['capacity', 'limit_impact', '-'],
    ],
    loops: [
      ['R1', 'Growth efforts raise demand, which spurs more', [1, 2]],
      ['B2', 'The limiting factor slows demand', [3, 4]],
      ['B3', 'Investing in capacity eases the limit', [5, 7, 8, 9]],
    ],
  },
];

function buildArchetype(a: Archetype): Project {
  const linkId = (n: number) => `L${n}`;
  const book = a.bookName ? `“${a.bookName}”, as the book calls it, ` : '';
  return ProjectSchema.parse({
    format: 'loopweft',
    version: 1,
    meta: {
      title: a.name,
      description:
        `The structure of the “${a.name}” system archetype: ${book}as Kim and Anderson (1998, ${a.figure}) draw it. ` +
        'Rename the variables for the system you are mapping, and cite your own sources for its links.',
    },
    variables: a.variables.map(([id, label]) => ({ id, label, citations: [] })),
    links: a.links.map(([from, to, sign, delay], i) => ({
      id: linkId(i + 1),
      from,
      to,
      sign,
      ...(delay ? { delay: true } : {}),
      citations: [],
    })),
    layout: {
      positions: Object.fromEntries(a.variables.map(([id, , x, y]) => [id, { x, y }])),
    },
    loops: a.loops.map(([id, name, links]) => ({
      id,
      name,
      links: links.map(linkId),
      archetype: a.name,
      caution: 'A conceptual archetype, not a measured loop.',
      citations: [{ source: ARCHETYPE_SOURCE.id, note: a.figure }],
    })),
    sources: [
      {
        ...ARCHETYPE_SOURCE,
        summary: `The structure of the “${a.bookName ?? a.name}” archetype (${a.figure}).`,
      },
    ],
  });
}

/** Every template, the blank map first. The polycrisis example is a file of its own (examples/). */
export const TEMPLATES: readonly Template[] = [
  {
    id: 'blank',
    name: 'Blank map',
    summary: 'Nothing yet: add variables and links.',
    build: () => createProject({ title: 'Untitled map' }),
  },
  ...ARCHETYPES.map((a) => ({ id: a.id, name: a.name, summary: a.summary, build: () => buildArchetype(a) })),
];

/** A template by id. */
export const templateById = (id: string): Template | undefined => TEMPLATES.find((t) => t.id === id);
