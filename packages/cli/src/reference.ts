// The command line's full reference (docs/cli.md), written from the commands themselves: every command, its
// arguments and options as main.ts defines them, and examples that really run, on a small project made by
// the commands shown at the top, with their plain and --json output as printed. Nothing in it is typed by
// hand but the prose and the example command lines, so it cannot drift from the code: a test rebuilds it and
// compares (`npm run cli-docs` writes it).
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Argument, Command, Option } from 'commander';
import { describeProgram, main } from './main.ts';

/** A command line shown in the reference. `run: false` shows it without running it (it needs a browser). */
interface Example {
  args: string[];
  /** The exit code it must end with (default 0). */
  code?: number;
  run?: false;
  /** A line under the example. */
  note?: string;
}

const PROJECT = 'pop.loopweft';

/** An empty folder beside the project, made fresh for each run (for `guide --install`). */
const FOLDER = 'maps';

/** The commands that make the project every example starts from. */
const SETUP: string[][] = [
  ['new', PROJECT, '--title', 'Population'],
  [
    'add',
    PROJECT,
    '--shorthand',
    'Births -> Population (+)\\nPopulation -> Births (+, delay "20 yrs")\\nPopulation -> Deaths (+)\\nDeaths -> Population (-)\\n@group People: Births, Population, Deaths',
  ],
  ['var', 'add', PROJECT, '--label', 'Fertility', '--definition', 'Births per woman.'],
  ['link', 'add', PROJECT, '--from', 'Fertility', '--to', 'Births', '--sign', '+'],
  ['loops', 'add', PROJECT, '--links', 'L2,L1', '--name', 'More people, more births'],
  [
    'source',
    'add',
    PROJECT,
    '--apa',
    'Example, A. (2020). *A fictitious source for this reference*. Example Press.',
    '--id',
    'example',
    '--label',
    'Example (2020)',
    '--summary',
    'Not a real work: it shows what a source looks like.',
  ],
  ['cite', 'add', PROJECT, 'L1', 'example', '--pages', '4'],
  ['story', 'scene', 'add', PROJECT, '--title', 'Growth', '--headline', 'Births feed the population.'],
  ['story', 'step', 'add', PROJECT, 'S1', '--label', 'The map'],
  [
    'story',
    'step',
    'add',
    PROJECT,
    'S1',
    '--label',
    'The loop',
    '--active',
    'L1,L2',
    '--badge',
    'R1',
    '--pulse-loop',
    'R1',
  ],
  ['story', 'overlay', 'add', PROJECT, 'S1.1', 'caption'],
  ['story', 'image', 'add', PROJECT, 'chart.png'],
  ['story', 'overlay', 'add', PROJECT, 'S1.1', 'image', '--image', 'chart', '--alt', 'A one-pixel picture'],
  ['story', 'overlay', 'add', PROJECT, 'S1.2', 'caption'],
  [
    'story',
    'overlay',
    'add',
    PROJECT,
    'S1.2',
    'statement',
    '--line',
    'More people, more births.',
    '--style',
    'question',
    '--cite',
    'example:4',
  ],
];

/** A 1×1 PNG. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** Files beside the project that some examples read. */
const FILES: Record<string, string | Uint8Array> = {
  'links.csv': 'From,To,Sign\nRainfall,Crop yield,+\nCrop yield,Food prices,-\n',
  'more.txt': '# One link per line\nFertility -> Population (+, delay)\n',
  'chart.png': PIXEL,
  'photo.png': PIXEL,
};

const DRAWN = 'Drawn in Chrome or Edge, so not run for this page: see [exporting](export.md).';

/** Examples by command (as `commandNames()` names it; `type <kind> …` for the type commands). */
const EXAMPLES: Record<string, Example[]> = {
  guide: [
    {
      args: ['guide'],
      run: false,
      note: 'Prints [the guide](agents/SKILL.md) (with `--json`: `{ "ok": true, "guide": "<its text>" }`).',
    },
    { args: ['guide', '--install', FOLDER] },
  ],
  meta: [
    { args: ['meta', PROJECT] },
    {
      args: ['meta', PROJECT, '--description', 'A sketch of population feedback, not a model.'],
    },
  ],
  theme: [
    { args: ['theme', PROJECT] },
    { args: ['theme', PROJECT, '--base', 'light', '--palette', 'okabe-ito'] },
  ],
  new: [
    { args: ['new', 'growth.loopweft', '--template', 'limits-to-growth'] },
    { args: ['new', 'blank.loopweft', '--title', 'Water supply'] },
  ],
  info: [{ args: ['info', PROJECT] }],
  validate: [{ args: ['validate', PROJECT] }],
  add: [
    { args: ['add', PROJECT, '--shorthand', 'Food supply -> Births (+, conf=M)\\nWar -> Deaths'] },
    { args: ['add', PROJECT, '--shorthand-file', 'more.txt', '--dry-run'] },
  ],
  import: [{ args: ['import', 'links.csv', '-o', 'food.loopweft', '--title', 'Food'] }],
  export: [
    { args: ['export', PROJECT, '--html'] },
    { args: ['export', PROJECT, '--pdf', 'references', '--paper', 'a4'] },
    { args: ['export', PROJECT, '--png', '--step', 'S1.2'], run: false, note: DRAWN },
    { args: ['export', PROJECT, '--svg', '--map', '--trim'], run: false, note: DRAWN },
    { args: ['export', PROJECT, '--svg', '--step', 'S1.2', '--for-office'], run: false, note: DRAWN },
    { args: ['export', PROJECT, '--mp4', '--scene', 'Growth'], run: false, note: DRAWN },
  ],
  'var list': [{ args: ['var', 'list', PROJECT] }],
  'var show': [{ args: ['var', 'show', PROJECT, 'Births'] }],
  'var add': [
    {
      args: [
        'var',
        'add',
        PROJECT,
        '--label',
        'Mortality',
        '--definition',
        'Deaths per 1,000 people a year.',
      ],
    },
  ],
  'var set': [
    { args: ['var', 'set', PROJECT, 'Population', '--size', 'large', '--map-label', 'Popu-\\nlation'] },
  ],
  'var rm': [
    { args: ['var', 'rm', PROJECT, 'Fertility'], code: 2 },
    { args: ['var', 'rm', PROJECT, 'Fertility', '--cascade'] },
  ],
  'link list': [{ args: ['link', 'list', PROJECT] }],
  'link show': [{ args: ['link', 'show', PROJECT, 'L1'] }],
  'link add': [
    { args: ['link', 'add', PROJECT, '--from', 'Population', '--to', 'Fertility', '--sign', '?'] },
  ],
  'link set': [
    {
      args: [
        'link',
        'set',
        PROJECT,
        'L1',
        '--confidence',
        'high',
        '--rationale',
        'Each birth adds a person.',
      ],
    },
    // New ends that break the named loop R1 through L1: refused, then with --cascade.
    { args: ['link', 'set', PROJECT, 'L1', '--from', 'Fertility'], code: 2 },
    { args: ['link', 'set', PROJECT, 'L1', '--from', 'Fertility', '--cascade'] },
  ],
  'link rm': [{ args: ['link', 'rm', PROJECT, 'L5'] }],
  'link flip': [{ args: ['link', 'flip', PROJECT, 'L4', '--dry-run'] }],
  'type <kind> add': [
    { args: ['type', 'category', 'add', PROJECT, '--name', 'Economy', '--colour', '#d9a441'] },
    { args: ['type', 'role', 'add', PROJECT, '--name', 'Stock', '--shape', 'rounded-square'] },
    { args: ['type', 'link', 'add', PROJECT, '--name', 'Side effect', '--style', 'dashed', '--optional'] },
    {
      args: [
        'type',
        'field',
        'add',
        PROJECT,
        '--name',
        'Evidence',
        '--kind',
        'choice',
        '--applies-to',
        'links',
        '--option',
        'explicit=Explicit',
        '--option',
        'synthesis=Synthesis',
      ],
    },
  ],
  'type <kind> set': [
    { args: ['type', 'category', 'set', PROJECT, 'People', '--description', 'Who lives here.'] },
  ],
  'type <kind> rm': [
    { args: ['type', 'category', 'rm', PROJECT, 'People'], code: 2 },
    { args: ['type', 'category', 'rm', PROJECT, 'People', '--cascade'] },
  ],
  'type <kind> move': [{ args: ['type', 'category', 'move', PROJECT, 'People', '--to', '1'] }],
  'loops list': [{ args: ['loops', 'list', PROJECT] }],
  'loops add': [{ args: ['loops', 'add', PROJECT, '--links', 'L3,L4', '--name', 'Deaths balance births'] }],
  'loops set': [
    { args: ['loops', 'set', PROJECT, 'R1', '--description', 'Each generation has more parents.'] },
  ],
  'loops rm': [{ args: ['loops', 'rm', PROJECT, 'R1', '--cascade'] }],
  ripple: [{ args: ['ripple', PROJECT, 'Births', 'up'] }],
  paths: [{ args: ['paths', PROJECT, 'Fertility', 'Deaths'] }],
  connected: [{ args: ['connected', PROJECT, '--limit', '3'] }],
  'source list': [{ args: ['source', 'list', PROJECT] }],
  'source show': [{ args: ['source', 'show', PROJECT, 'example'] }],
  'source lookup': [
    {
      args: ['source', 'lookup', '10.1017/sus.2024.1'],
      note: 'Answered here from a recorded Crossref reply; the command itself asks Crossref.',
    },
  ],
  'source add': [
    {
      args: ['source', 'add', PROJECT, '--doi', '10.1017/sus.2024.1', '--id', 'L'],
      note: 'Answered here from a recorded Crossref reply; the command itself asks Crossref.',
    },
    {
      args: [
        'source',
        'add',
        PROJECT,
        '--apa',
        'Example, B. (2021). *Another fictitious source*. Example Press.',
        '--label',
        'Example (2021)',
      ],
    },
  ],
  'source set': [{ args: ['source', 'set', PROJECT, 'example', '--licence', 'CC BY 4.0'] }],
  'source rm': [
    { args: ['source', 'rm', PROJECT, 'example'], code: 2 },
    { args: ['source', 'rm', PROJECT, 'example', '--cascade', '--dry-run'] },
  ],
  'cite list': [{ args: ['cite', 'list', PROJECT] }, { args: ['cite', 'list', PROJECT, '--uncited'] }],
  'cite add': [
    { args: ['cite', 'add', PROJECT, 'L2,Births', 'example', '--pages', '5–6', '--strength', 'moderate'] },
  ],
  'cite set': [{ args: ['cite', 'set', PROJECT, 'L1', 'example', '--note', 'Fig. 2'] }],
  'cite rm': [{ args: ['cite', 'rm', PROJECT, 'L1', 'example'] }],
  references: [{ args: ['references', PROJECT] }],
  layout: [{ args: ['layout', PROJECT, '--auto', 'flow'] }, { args: ['layout', PROJECT] }],
  'story list': [{ args: ['story', 'list', PROJECT] }],
  'story show': [{ args: ['story', 'show', PROJECT, 'S1.2'] }],
  'story scene add': [
    { args: ['story', 'scene', 'add', PROJECT, '--title', 'Limits', '--target', '45', '--first'] },
  ],
  'story scene set': [
    { args: ['story', 'scene', 'set', PROJECT, 'S1', '--notes', 'Start with the whole map.'] },
  ],
  'story scene rm': [{ args: ['story', 'scene', 'rm', PROJECT, 'S1', '--cascade'] }],
  'story scene move': [{ args: ['story', 'scene', 'move', PROJECT, 'Growth', '--last'] }],
  'story step add': [
    {
      args: [
        'story',
        'step',
        'add',
        PROJECT,
        'S1',
        '--label',
        'Deaths push back',
        '--base',
        'dim',
        '--active',
        'L3,L4',
        '--up',
        'Deaths',
        '--pulse',
        'L3',
        '--pulse',
        'L4',
      ],
    },
    { args: ['story', 'step', 'add', PROJECT, 'S1', '--label', 'If births rise', '--ripple', 'Births=up'] },
  ],
  'story step set': [
    { args: ['story', 'step', 'set', PROJECT, 'S1.2', '--cue', 'Wait for the pulse.'] },
    { args: ['story', 'step', 'set', PROJECT, 'S1.2', '--ripple', 'Deaths=down'] },
  ],
  'story step rm': [{ args: ['story', 'step', 'rm', PROJECT, 'S1.1'] }],
  'story step move': [{ args: ['story', 'step', 'move', PROJECT, 'S1.2', '--first'] }],
  'story step copy': [{ args: ['story', 'step', 'copy', PROJECT, 'S1.2', '--label', 'The loop again'] }],
  'story overlay add': [
    {
      args: [
        'story',
        'overlay',
        'add',
        PROJECT,
        'S1.2',
        'cards',
        '--card',
        'Births | more people',
        '--card',
        'Deaths | fewer people',
        '--place',
        'right',
      ],
    },
  ],
  'story overlay set': [{ args: ['story', 'overlay', 'set', PROJECT, 'S1.2', '1', '--place', 'top'] }],
  'story overlay rm': [{ args: ['story', 'overlay', 'rm', PROJECT, 'S1.2', '1'] }],
  'story overlay move': [{ args: ['story', 'overlay', 'move', PROJECT, 'S1.2', '1', '--to', '0'] }],
  'story image add': [{ args: ['story', 'image', 'add', PROJECT, 'photo.png'] }],
  'story image set': [{ args: ['story', 'image', 'set', PROJECT, 'chart', 'photo.png'] }],
  'story image rm': [
    { args: ['story', 'image', 'rm', PROJECT, 'chart'], code: 2 },
    { args: ['story', 'image', 'rm', PROJECT, 'chart', '--cascade'] },
  ],
};

/** Failures shown at the top, beside the contract they illustrate. */
const FAILURES: Example[] = [
  { args: ['link', 'add', PROJECT, '--from', 'Births', '--to', 'Nowhere', '--sign', '+'], code: 2 },
  { args: ['link', 'add', PROJECT, '--from', 'Births', '--to', 'Deaths'], code: 2 },
];

export interface ReferenceOptions {
  /** The fetch the DOI examples use: recorded replies, so the page is the same everywhere. */
  fetch: typeof fetch;
  /** The date stamped on what the examples save. */
  today?: string;
}

interface Ran {
  example: Example;
  text?: string;
  json?: string;
}

const FILE_ARG = /\.(loopweft|txt|csv|json|xlsx|png|html|pdf)$/;

/** A folder holding the example project and its files. */
function setUp(base: string): void {
  for (const [name, data] of Object.entries(FILES)) writeFileSync(join(base, name), data);
}

function copyFolder(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (entry.isFile()) copyFileSync(join(from, entry.name), join(to, entry.name));
  }
}

/** Runs one command line in a folder; paths in its output are shown relative to that folder. */
async function runIn(folder: string, args: string[], options: ReferenceOptions) {
  let out = '';
  let err = '';
  const env = { today: options.today ?? '2026-01-01', fetch: options.fetch };
  mkdirSync(join(folder, FOLDER), { recursive: true });
  const code = await main(
    args.map((arg) => (FILE_ARG.test(arg) || arg === FOLDER ? join(folder, arg) : arg)),
    { out: (t) => (out += t), err: (t) => (err += t) },
    env,
  );
  const local = (text: string) =>
    text
      .split(`${folder}\\`)
      .join('')
      .split(`${folder}/`)
      .join('')
      .split(JSON.stringify(folder).slice(1, -1).concat('\\\\'))
      .join('');
  return { code, text: local(out + err), out: local(out) };
}

/** Runs an example twice, plainly and with --json, each on a fresh copy of the example project. */
async function runExample(base: string, example: Example, options: ReferenceOptions): Promise<Ran> {
  if (example.run === false) return { example };
  const results: string[] = [];
  for (const json of [false, true]) {
    const folder = mkdtempSync(join(tmpdir(), 'loopweft-ref-'));
    try {
      copyFolder(base, folder);
      const args = json ? ['--json', ...example.args] : example.args;
      const { code, text, out } = await runIn(folder, args, options);
      if (code !== (example.code ?? 0)) {
        throw new Error(
          `The reference's example \`loopweft ${example.args.join(' ')}\` ended with exit ${code}, not ${example.code ?? 0}:\n${text}`,
        );
      }
      // With --json, stdout holds the one document (commander's own usage errors also go to stderr).
      results.push((json ? out : text).trimEnd());
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }
  return { example, text: results[0], json: results[1] };
}

// ---------------------------------------------------------------------------------------------------------
// Writing it out

/**
 * A command line as typed: an argument with spaces or shell characters in single quotes, which bash, zsh and
 * PowerShell all take literally; one that holds a single quote in double quotes.
 */
export function commandLine(args: string[]): string {
  const quote = (arg: string) => {
    if (/^[\w./:,=+@–-]+$/.test(arg)) return arg;
    if (!arg.includes("'")) return `'${arg}'`;
    return `"${arg.replace(/["\\$`]/g, (c) => `\\${c}`)}"`;
  };
  return ['loopweft', ...args.map(quote)].join(' ');
}

const MAX_LINES = 30;
const MAX_ITEMS = 3;
const MAX_STRING = 300;

/** Plain output, cut after a screenful. */
function shortText(text: string): string {
  const lines = text.split('\n');
  if (lines.length <= MAX_LINES) return text;
  return [...lines.slice(0, MAX_LINES), `… (${lines.length - MAX_LINES} more lines)`].join('\n');
}

/** JSON as the command prints it, but long lists cut after a few items, with a comment saying how many. */
function shortJson(value: unknown, indent = ''): string {
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    const shown = value.slice(0, MAX_ITEMS).map((v) => `${inner}${shortJson(v, inner)}`);
    const more = value.length - MAX_ITEMS;
    const tail = more > 0 ? `\n${inner}// … ${more} more` : '';
    return `[\n${shown.join(',\n')}${tail}\n${indent}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return '{}';
    const shown = entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${shortJson(v, inner)}`);
    return `{\n${shown.join(',\n')}\n${indent}}`;
  }
  if (typeof value === 'string' && value.length > MAX_STRING) {
    return `${JSON.stringify(value.slice(0, MAX_STRING))} // … ${value.length - MAX_STRING} more characters`;
  }
  return JSON.stringify(value);
}

const sentence = (text: string) => {
  const t = text.trim();
  const capital = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.?!]$/.test(capital) ? capital : `${capital}.`;
};

const cell = (text: string) => text.replace(/\|/g, '\\|');

function argumentText(argument: Argument): string {
  const name = `${argument.name()}${argument.variadic ? '...' : ''}`;
  return argument.required ? `<${name}>` : `[${name}]`;
}

/** The usage line: the command, its arguments, its required options, then [options]. */
function usage(path: string, command: Command): string {
  const required = command.options.filter((o) => o.mandatory).map((o) => o.flags.replace(/^-\w, /, ''));
  const optional = command.options.some((o) => !o.mandatory) ? ['[options]'] : [];
  return ['loopweft', path, ...command.registeredArguments.map(argumentText), ...required, ...optional].join(
    ' ',
  );
}

function optionRows(options: readonly Option[]): string[] {
  if (!options.length) return ['No options.'];
  return [
    '| Option | Means |',
    '|---|---|',
    ...options.map(
      (o) =>
        `| \`${cell(o.flags)}\`${o.mandatory ? ' (required)' : ''} | ${cell(sentence(o.description ?? ''))} |`,
    ),
  ];
}

function exampleBlock(ran: Ran): string[] {
  const lines = ['```console', `$ ${commandLine(ran.example.args)}`];
  if (ran.text !== undefined) {
    if (ran.text) lines.push(shortText(ran.text));
    lines.push(`[exit ${ran.example.code ?? 0}]`);
  }
  lines.push('```');
  if (ran.example.note) lines.push('', ran.example.note);
  if (ran.json !== undefined) {
    lines.push('', 'With `--json`:', '', '```jsonc', shortJson(JSON.parse(ran.json)), '```');
  }
  return lines;
}

const anchor = (heading: string) =>
  heading
    .toLowerCase()
    .replace(/[^\w\s<>-]/g, '')
    .replace(/[<>]/g, '')
    .trim()
    .replace(/\s+/g, '-');

interface Section {
  path: string;
  command: Command;
  /** For `type <kind> …`: the kinds it covers. */
  kinds?: string[];
}

interface Chapter {
  name: string;
  description: string;
  sections: Section[];
}

const optionsKey = (command: Command) =>
  JSON.stringify([
    command.registeredArguments.map(argumentText),
    command.options.map((o) => [o.flags, o.mandatory]),
  ]);

/** The command tree as chapters: a top-level command alone, or a group and its commands. */
function chapters(program: Command): Chapter[] {
  const result: Chapter[] = [];
  for (const top of program.commands) {
    const name = top.name();
    if (!top.commands.length) {
      result.push({ name, description: top.description(), sections: [{ path: name, command: top }] });
      continue;
    }
    const sections: Section[] = [];
    if (name === 'type') {
      // Every kind (category, role, link, field) takes the same commands and options: shown once.
      const kinds = top.commands.map((k) => k.name());
      const [first, ...rest] = top.commands;
      if (!first) continue;
      for (const verb of first.commands) {
        for (const other of rest) {
          const twin = other.commands.find((c) => c.name() === verb.name());
          if (!twin || optionsKey(twin) !== optionsKey(verb))
            throw new Error(`type ${other.name()} ${verb.name()} differs from type ${first.name()}'s.`);
        }
        sections.push({ path: `type <kind> ${verb.name()}`, command: verb, kinds });
      }
    } else {
      const walk = (command: Command, prefix: string[]) => {
        for (const child of command.commands) {
          const path = [...prefix, child.name()];
          if (child.commands.length) walk(child, path);
          else sections.push({ path: path.join(' '), command: child });
        }
      };
      walk(top, [name]);
    }
    result.push({ name, description: top.description(), sections });
  }
  return result;
}

const INTRO = `# The \`loopweft\` command line: reference

Every command, with every option, and examples that were really run. This page is generated from the commands
themselves (\`npm run cli-docs\`); a test fails when it is out of date, so it always matches this copy of
Loopweft. For a shorter overview see [the command line's README](../packages/cli/README.md); for the file it
edits, [the format](format.md); for working with an AI agent, [the agent guide](agents/SKILL.md).

Inside the repository, run it as \`npx loopweft …\` (after \`npm install\`) or \`npm run loopweft -- …\`. It needs
Node 24. \`loopweft help <command>\` (or \`<command> --help\`) prints a command's options.

## How every command answers

- **Plain output** goes to stdout; a failure's message goes to stderr.
- **\`--json\`**, anywhere on the line, prints exactly one JSON document on stdout instead: \`{ "ok": true, … }\`
  with the command's results, or \`{ "ok": false, "error": { "message", "exitCode", "issues" } }\`. \`issues\` is
  there when there is something to point at: each has a \`code\`, a \`severity\` (\`error\` or \`warning\`), a
  \`message\` and a \`path\` into the project (\`["links", 3, "from"]\`) or a \`line\` (shorthand).
- **Exit codes:**

| Exit code | Means | What to do |
|---|---|---|
| 0 | Done | Go on |
| 1 | The project is invalid, or the change would make it so | Read \`issues\`; fix what they name; nothing was saved |
| 2 | The command was used wrongly: a missing file, an unknown variable, a removal something still needs, a lookup that failed | Read the message; fix the command; nothing was saved |
| 3 | Internal error | Report it; \`LOOPWEFT_DEBUG=1\` prints a stack trace |

- **Edits** save only when something changed. \`--dry-run\` shows what would change, without saving. A save is
  atomic (a temporary file moved into place), keeps the previous version as \`<file>.bak\`, and stamps
  \`meta.modified\` with today's date (\`SOURCE_DATE_EPOCH\`, in seconds, sets the date instead, so a run can be
  repeated byte for byte).
- **Naming things:** variables by id or label (ignoring case and spacing; a name that matches two is refused);
  links, loops and sources by id (sources by label too); scenes by id or title; steps as \`S1.2\` (the scene,
  then the step's own id or label).
- **Values are read strictly.** A sign is required: \`+\`, \`-\`, or \`?\` when it is not known (flagged, never
  guessed). \`--weight heavy\`, or a field value that is not one of its choices, is refused, not stored.
- **The network:** only \`source lookup\` and \`source add --doi\` use it, to send the DOI (and nothing else) to
  Crossref, and then DataCite.

Two failures, as they print:
`;

/** The reference as Markdown. */
export async function buildReference(options: ReferenceOptions): Promise<string> {
  const program = describeProgram();
  const base = mkdtempSync(join(tmpdir(), 'loopweft-ref-base-'));
  try {
    setUp(base);
    for (const args of SETUP) {
      const { code, text } = await runIn(base, args, options);
      if (code !== 0) throw new Error(`The reference's setup \`${args.join(' ')}\` failed:\n${text}`);
    }
    for (const name of readdirSync(base)) if (name.endsWith('.bak')) rmSync(join(base, name));

    const out: string[] = [INTRO];
    for (const failure of FAILURES) out.push(...exampleBlock(await runExample(base, failure, options)), '');

    out.push(
      '## The example project',
      '',
      `Every example starts from a fresh copy of \`${PROJECT}\`, made by these commands (the source is not a real`,
      'work), with `links.csv`, `more.txt` and two one-pixel pictures, `chart.png` and `photo.png`, beside it:',
      '',
      '```console',
      ...SETUP.map((args) => `$ ${commandLine(args)}`),
      '```',
      '',
    );

    const all = chapters(program);
    out.push('## Commands', '');
    for (const chapter of all) {
      const anchorOf = (s: Section) => anchor(s.path);
      const entries =
        chapter.sections.length === 1 && chapter.sections[0]?.path === chapter.name
          ? [`[\`${chapter.name}\`](#${anchor(chapter.name)})`]
          : chapter.sections.map((s) => `[\`${s.path}\`](#${anchorOf(s)})`);
      out.push(`- ${entries.join(' · ')}: ${sentence(chapter.description).replace(/\.$/, '')}`);
    }
    out.push('');

    const used = new Set<string>();
    for (const chapter of all) {
      const single = chapter.sections.length === 1 && chapter.sections[0]?.path === chapter.name;
      if (!single) out.push(`## \`${chapter.name}\``, '', sentence(chapter.description), '');
      for (const section of chapter.sections) {
        const examples = EXAMPLES[section.path];
        if (!examples?.length) throw new Error(`The reference has no example of \`${section.path}\`.`);
        used.add(section.path);
        out.push(
          `${single ? '##' : '###'} \`${section.path}\``,
          '',
          sentence(section.command.description()),
          '',
        );
        if (section.kinds) {
          out.push(`\`<kind>\` is one of ${section.kinds.map((k) => `\`${k}\``).join(', ')}.`, '');
        }
        out.push('```text', usage(section.path, section.command), '```', '');
        out.push(...optionRows(section.command.options), '');
        for (const example of examples)
          out.push(...exampleBlock(await runExample(base, example, options)), '');
      }
    }
    const unused = Object.keys(EXAMPLES).filter((k) => !used.has(k));
    if (unused.length)
      throw new Error(`The reference has examples of commands it does not know: ${unused.join(', ')}.`);
    return `${out.join('\n').trimEnd()}\n`;
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}
