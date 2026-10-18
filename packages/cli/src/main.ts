// Source: DataViz packages/cli/src/main.ts @ efcdbe2 (TashiikiD/DataViz, private), adapted for Loopweft:
// the command tree is Loopweft's; the output contract and exit codes are DataViz's.
//
// The `loopweft` command line. With `--json`, stdout carries exactly one JSON document:
// `{ "ok": true, ... }`, or `{ "ok": false, "error": { "message", "exitCode", "issues" } }`.
// Exit codes: 0 ok · 1 the project is invalid (or would become so) · 2 wrong usage · 3 internal error.
import { readFileSync } from 'node:fs';
import { OpError } from '@loopweft/model';
import { Command, CommanderError } from 'commander';
import {
  addCommand,
  type CommandResult,
  infoCommand,
  layoutCommand,
  linkAddCommand,
  linkFlipCommand,
  linkListCommand,
  linkRemoveCommand,
  linkSetCommand,
  loopAddCommand,
  loopRemoveCommand,
  loopSetCommand,
  loopsListCommand,
  newCommand,
  rippleCommand,
  TEMPLATE_IDS,
  TYPE_KINDS,
  typeAddCommand,
  typeMoveCommand,
  typeRemoveCommand,
  typeSetCommand,
  validateCommand,
  varAddCommand,
  varListCommand,
  varRemoveCommand,
  varSetCommand,
} from './commands.ts';
import { importCommand } from './import.ts';
import type { Env } from './support.ts';

export interface Io {
  out(text: string): void;
  err(text: string): void;
}

const processIo: Io = {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
};

export const EXIT = { ok: 0, invalid: 1, usage: 2, internal: 3 } as const;

const VERSION = (
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
).version;

type Run = (handler: () => CommandResult | Promise<CommandResult>) => () => Promise<void>;

const DRY_RUN = 'show what would change, without saving';
const collect = (value: string, previous: string[] = []) => [...previous, value];

/** The `loopweft` command tree. Actions hand their handler to `run`, which decides when and how it runs. */
function createProgram(io: Io, env: () => Env, run: Run): Command {
  const program = new Command('loopweft')
    .description('Build and check Loopweft causal maps (.loopweft files) from the command line.')
    .version(VERSION)
    .option('--json', 'print one machine-readable JSON document on stdout')
    .showHelpAfterError('(run with --help for usage)')
    .exitOverride()
    .configureOutput({ writeOut: (s) => io.out(s), writeErr: (s) => io.err(s) });

  program
    .command('new <file>')
    .description('create a project file: an empty map, or one made from a template')
    .option('--title <title>', 'the title of the map (required for a blank map)')
    .option('--template <id>', `start from a template: ${TEMPLATE_IDS.join(', ')}`)
    .option('--force', 'replace an existing file')
    .action((file: string, o) => run(() => newCommand(env(), file, o))());

  program
    .command('info <file>')
    .description('what a project holds: counts, types, named loops, theme, layout and warnings')
    .action((file: string) => run(() => infoCommand(file))());

  program
    .command('validate <file>')
    .description('check a project: errors (exit 1) and warnings')
    .action((file: string) => run(() => validateCommand(file))());

  program
    .command('add <file>')
    .description('add links written in shorthand, e.g. "Births -> Population (+)"')
    .option('--shorthand <text>', 'shorthand text (\\n separates lines)')
    .option('--shorthand-file <file>', 'read the shorthand from a file')
    .option('--dry-run', DRY_RUN)
    .action((file: string, o) => run(() => addCommand(env(), file, o))());

  program
    .command('import <input>')
    .description(
      'make a .loopweft file from tables (CSV, TSV, Excel), a Kumu map (its JSON export, a blueprint or its spreadsheet), or a DataViz project',
    )
    .requiredOption('-o, --out <file>', 'the .loopweft file to write')
    .option('--format <format>', 'tables, kumu or dataviz (default: worked out from the file)')
    .option('--title <title>', 'the title of the map (default: from the file)')
    .option(
      '--sheet <name=kind>',
      'tables: what a sheet holds: variables, links or ignore (repeatable)',
      collect,
    )
    .option('--header-row <n|sheet=n>', 'tables: the row holding the column names (1 = first; none)', collect)
    .option(
      '--map <column=target>',
      'tables: where a column goes: a field (from, to, sign, label…), ignore, or field:<name>[:<kind>]; Sheet:Column=… for one sheet (repeatable)',
      collect,
    )
    .option('--sign-field <field>', 'kumu: the connection field that holds the signs')
    .option(
      '--layout <kind>',
      'lay out what the file does not place: force (default), constellation, flow or none',
    )
    .option('--seed <n>', 'the layout seed (default 1337)')
    .option('--encoding <name>', 'text files: utf-8, windows-1252, utf-16le or utf-16be (default: detected)')
    .option('--force', 'replace the output file if it exists')
    .option('--dry-run', 'read and check the file, without writing')
    .action((input: string, o) => run(() => importCommand(env(), input, o))());

  const variable = program.command('var').description('variables: list, add, set, rm');
  variable
    .command('list <file>')
    .description('list the variables')
    .action((file: string) => run(() => varListCommand(file))());
  const variableOptions = (command: Command) =>
    command
      .option('--map-label <text>', 'a shorter name drawn on the map (\\n breaks the line)')
      .option('--category <id>', 'a category id')
      .option('--role <id>', 'a role id')
      .option('--definition <text>', 'what rises or falls')
      .option('--size <size>', 'normal or large (a hub)')
      .option('--field <key=value>', 'a custom field value (repeatable)', collect)
      .option('--at <x,y>', 'place it on the map, in map units')
      .option('--dry-run', DRY_RUN);
  variableOptions(
    variable
      .command('add <file>')
      .description('add a variable (its id is made from the label unless --id is given)')
      .requiredOption('--label <text>', 'its full name')
      .option('--id <id>', 'its id'),
  ).action((file: string, o) => run(() => varAddCommand(env(), file, o))());
  variableOptions(
    variable
      .command('set <file> <variable>')
      .description('change a variable, named by id or label (its id stays)')
      .option('--label <text>', 'its full name')
      .option('--clear <fields...>', 'clear these: mapLabel, category, role, definition, size')
      .option('--clear-field <ids...>', 'clear these custom fields'),
  ).action((file: string, ref: string, o) => run(() => varSetCommand(env(), file, ref, o))());
  variable
    .command('rm <file> <variables...>')
    .description('remove variables; those that links, loops or the story use need --cascade')
    .option('--cascade', 'also remove their links and loops, and their mentions in the story')
    .option('--dry-run', DRY_RUN)
    .action((file: string, refs: string[], o) => run(() => varRemoveCommand(env(), file, refs, o))());

  const link = program.command('link').description('links: list, add, set, rm, flip');
  link
    .command('list <file>')
    .description('list the links')
    .action((file: string) => run(() => linkListCommand(file))());
  const linkOptions = (command: Command) =>
    command
      .option('--type <id>', 'a link type id')
      .option('--conditional', 'the effect holds only under some conditions')
      .option('--delay [label]', 'the effect takes notably long (optionally how long, e.g. "5 yrs")')
      .option('--confidence <level>', 'low, medium or high (L, M, H)')
      .option('--weight <n>', 'relative strength, 0 or more, for line thickness')
      .option('--rationale <text>', 'why the cause moves the effect')
      .option('--field <key=value>', 'a custom field value (repeatable)', collect)
      .option('--dry-run', DRY_RUN);
  linkOptions(
    link
      .command('add <file>')
      .description('add a link between variables named by id or label')
      .requiredOption('--from <variable>', 'the cause')
      .requiredOption('--to <variable>', 'the effect')
      .requiredOption('--sign <sign>', '+ (same direction), - (opposite) or ? (not known)')
      .option('--id <id>', 'its id (default: the next free L<n>)'),
  ).action((file: string, o) => run(() => linkAddCommand(env(), file, o))());
  linkOptions(
    link
      .command('set <file> <link>')
      .description('change a link (its id stays)')
      .option('--from <variable>', 'the cause')
      .option('--to <variable>', 'the effect')
      .option('--sign <sign>', '+, - or ?')
      .option(
        '--clear <fields...>',
        'clear these: type, conditional, delay, delayLabel, confidence, weight, rationale',
      )
      .option('--clear-field <ids...>', 'clear these custom fields'),
  ).action((file: string, id: string, o) => run(() => linkSetCommand(env(), file, id, o))());
  link
    .command('rm <file> <links...>')
    .description('remove links; those that loops or the story use need --cascade')
    .option('--cascade', 'also remove the loops through them, and their mentions in the story')
    .option('--dry-run', DRY_RUN)
    .action((file: string, ids: string[], o) => run(() => linkRemoveCommand(env(), file, ids, o))());
  link
    .command('flip <file> <link>')
    .description('turn + into - or - into + (a ? has nothing to flip)')
    .option('--dry-run', DRY_RUN)
    .action((file: string, id: string, o) => run(() => linkFlipCommand(env(), file, id, o))());

  const type = program
    .command('type')
    .description('the vocabulary: categories, roles, link types and custom fields (add, set, rm, move)');
  const typeOptions = (command: Command) =>
    command
      .option('--description <text>', 'what it means')
      .option('--colour <#rrggbb>', 'category: its colour (default: from the palette)')
      .option(
        '--shape <shape>',
        'role: circle, ring, square, rounded-square, octagon, diamond, triangle or hexagon',
      )
      .option('--response', 'role: marks deliberate responses, such as policies')
      .option('--style <style>', 'link type: solid, dashed or dotted')
      .option('--marker <marker>', 'link type: none or flag')
      .option('--optional', 'link type: not part of the main structure (left out of loop counts)')
      .option('--kind <kind>', 'field: text, number, choice or boolean')
      .option('--applies-to <what>', 'field: variables, links or both')
      .option('--option <id=name>', 'field: a choice (repeatable)', collect)
      .option('--dry-run', DRY_RUN);
  for (const [word, kind] of Object.entries(TYPE_KINDS)) {
    const label = word === 'link' ? 'link types' : word === 'category' ? 'categories' : `${word}s`;
    const group = type.command(word).description(label);
    typeOptions(
      group
        .command('add <file>')
        .description(`add one of the ${label} (its id is made from the name unless --id is given)`)
        .requiredOption('--name <name>', 'its name')
        .option('--id <id>', 'its id'),
    ).action((file: string, o) => run(() => typeAddCommand(env(), file, kind, o))());
    typeOptions(
      group
        .command('set <file> <ref>')
        .description('change one, named by id or name (its id stays)')
        .option('--name <name>', 'its name')
        .option('--clear <fields...>', 'clear these fields'),
    ).action((file: string, ref: string, o) => run(() => typeSetCommand(env(), file, kind, ref, o))());
    group
      .command('rm <file> <ref>')
      .description('remove one; one still in use needs --cascade')
      .option('--cascade', 'also clear its uses')
      .option('--dry-run', DRY_RUN)
      .action((file: string, ref: string, o) => run(() => typeRemoveCommand(env(), file, kind, ref, o))());
    group
      .command('move <file> <ref>')
      .description('move one to another place in its list (the order of colours and clusters)')
      .requiredOption('--to <position>', 'its new place, 1 = first')
      .option('--dry-run', DRY_RUN)
      .action((file: string, ref: string, o) => run(() => typeMoveCommand(env(), file, kind, ref, o))());
  }

  const loops = program.command('loops').description('feedback loops: list the loops found, and name them');
  loops
    .command('list <file>')
    .description('the loops the map makes, each R (reinforcing), B (balancing) or ? (a link of unknown sign)')
    .option('--max-length <n>', 'only loops of at most this many links')
    .option('--limit <n>', 'stop listing after this many loops (default 1000)')
    .option('--include-optional', 'count links of optional types too')
    .action((file: string, o) => run(() => loopsListCommand(file, o))());
  const loopOptions = (command: Command) =>
    command
      .option('--archetype <name>', 'a system archetype it follows, e.g. "Fixes that fail"')
      .option('--description <text>', 'what the loop does')
      .option('--caution <text>', 'what it does not show')
      .option('--dry-run', DRY_RUN);
  loopOptions(
    loops
      .command('add <file>')
      .description('name a loop: its links in order round the loop (see loops list)')
      .requiredOption('--links <ids>', 'link ids, comma-separated, in order')
      .requiredOption('--name <name>', 'its name')
      .option('--id <id>', 'its id (default: R<n> or B<n> by its polarity)'),
  ).action((file: string, o) => run(() => loopAddCommand(env(), file, o))());
  loopOptions(
    loops
      .command('set <file> <loop>')
      .description('change a named loop (its id stays)')
      .option('--name <name>', 'its name')
      .option('--links <ids>', 'its links, in order')
      .option('--clear <fields...>', 'clear these: archetype, description, caution'),
  ).action((file: string, id: string, o) => run(() => loopSetCommand(env(), file, id, o))());
  loops
    .command('rm <file> <loop>')
    .description('remove a named loop (its links stay); one the story shows needs --cascade')
    .option('--cascade', 'also remove it from the story steps that show it')
    .option('--dry-run', DRY_RUN)
    .action((file: string, id: string, o) => run(() => loopRemoveCommand(env(), file, id, o))());

  program
    .command('ripple <file> <variable> <direction>')
    .description(
      'what if a variable rises (up) or falls (down)? which way the change pushes each variable it reaches, by the signs of the links',
    )
    .option('--include-optional', 'follow links of optional types too')
    .option('--max-steps <n>', 'go no further than this many links from the start')
    .action((file: string, variable: string, direction: string, o) =>
      run(() => rippleCommand(file, variable, direction, o))(),
    );

  program
    .command('layout <file>')
    .description('show or change where things are drawn; edits run in the order of the options below')
    .option(
      '--auto <kind>',
      'lay the map out: constellation (by category), force or flow; pinned variables stay',
    )
    .option('--seed <n>', 'with --auto: the seed (default 1337); the same seed gives the same layout')
    .option('--move <id=x,y>', 'move a variable, in map units (repeatable)', collect)
    .option('--pin <variables...>', 'pin variables: automatic layouts leave them where they are')
    .option('--unpin <variables...>', 'unpin variables')
    .option('--label-side <id=side>', 'above, below, left, right or auto (repeatable)', collect)
    .option('--bend <link=value>', 'set a curve, -1 to 1, positive bends left (repeatable)', collect)
    .option('--clear-bends [links...]', 'curve these links (or every link) automatically again')
    .option('--home <x,y,zoom>', 'set the whole-map view: its centre in map units and its zoom')
    .option('--clear-home', 'fit the whole map instead of a home view')
    .option('--dry-run', DRY_RUN)
    .action((file: string, o) => run(() => layoutCommand(env(), file, o))());

  return program;
}

/** Every runnable command, e.g. `new`, `var add`, `type category add`. */
export function commandNames(): string[] {
  const names: string[] = [];
  const walk = (command: Command, prefix: string[]) => {
    for (const child of command.commands) {
      const path = [...prefix, child.name()];
      if (child.commands.length) walk(child, path);
      else names.push(path.join(' '));
    }
  };
  const silent: Io = { out: () => undefined, err: () => undefined };
  walk(
    createProgram(
      silent,
      () => ({ today: '' }),
      () => async () => undefined,
    ),
    [],
  );
  return names;
}

const issuesOf = (data: Record<string, unknown>): { issues?: unknown[] } =>
  Array.isArray(data.issues) && data.issues.length ? { issues: data.issues } : {};

/** Today's date, YYYY-MM-DD: SOURCE_DATE_EPOCH (seconds, UTC) when set, so outputs can be reproduced. */
export function today(
  environment: NodeJS.ProcessEnv = process.env,
  now: () => Date = () => new Date(),
): string {
  const epoch = environment.SOURCE_DATE_EPOCH;
  if (epoch !== undefined && /^\d+$/.test(epoch))
    return new Date(Number(epoch) * 1000).toISOString().slice(0, 10);
  const date = now();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Runs the command line; resolves to the exit code. */
export async function main(argv: string[], io: Io = processIo, env?: Env): Promise<number> {
  let result: CommandResult | undefined;
  let json = argv.includes('--json');
  const environment = () => (env ??= { today: today() });
  const program = createProgram(io, environment, (handler) => async () => {
    result = await handler();
  });

  try {
    await program.parseAsync(argv, { from: 'user' });
    json = program.opts().json === true;
    if (!result) return EXIT.ok;
    const exitCode = result.exitCode ?? EXIT.ok;
    if (json) {
      const failure =
        exitCode === 0
          ? {}
          : { error: { message: result.text.split('\n').at(-1) ?? '', exitCode, ...issuesOf(result.data) } };
      io.out(`${JSON.stringify({ ok: exitCode === 0, ...result.data, ...failure }, null, 2)}\n`);
    } else if (result.text) (exitCode === 0 ? io.out : io.err)(`${result.text}\n`);
    return exitCode;
  } catch (error) {
    if (error instanceof CommanderError) {
      if (['commander.helpDisplayed', 'commander.version', 'commander.help'].includes(error.code))
        return EXIT.ok;
      if (json) {
        const message = error.message.replace(/^error: /, '');
        io.out(`${JSON.stringify({ ok: false, error: { message, exitCode: EXIT.usage } }, null, 2)}\n`);
      }
      return EXIT.usage;
    }
    const known = error instanceof OpError;
    const exitCode = known ? (error as OpError).exitCode : EXIT.internal;
    const message = (error as Error).message;
    const issues = known ? (error as OpError).issues : [];
    if (json) {
      io.out(
        `${JSON.stringify({ ok: false, error: { message, exitCode, ...(issues.length ? { issues } : {}) } }, null, 2)}\n`,
      );
    } else {
      io.err(`${known ? '' : 'Internal error: '}${message}\n`);
      for (const i of issues as {
        severity?: string;
        message: string;
        path?: (string | number)[];
        line?: number;
      }[]) {
        const at = i.path ? i.path.join('.') : i.line !== undefined ? `line ${i.line}` : '';
        io.err(`  ${i.severity ?? 'error'} ${at}: ${i.message}\n`);
      }
      if (!known && process.env.LOOPWEFT_DEBUG) io.err(`${(error as Error).stack}\n`);
    }
    return exitCode;
  }
}
