// Source: DataViz packages/cli/src/main.ts @ efcdbe2 (TashiikiD/DataViz, private), adapted for Loopweft:
// the command tree is Loopweft's; the output contract and exit codes are DataViz's.
//
// The `loopweft` command line. With `--json`, stdout carries exactly one JSON document:
// `{ "ok": true, ... }`, or `{ "ok": false, "error": { "message", "exitCode", "issues" } }`.
// Exit codes: 0 ok · 1 the project is invalid (or would become so) · 2 wrong usage · 3 internal error.
import { readFileSync } from 'node:fs';
import { HOLD_DEFAULT } from '@loopweft/export';
import { FRAMES, LEVELS, OpError, PALETTE_IDS, PLACES } from '@loopweft/model';
import { Command, CommanderError } from 'commander';
import {
  addCommand,
  type CommandResult,
  connectedCommand,
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
  metaCommand,
  newCommand,
  pathsCommand,
  rippleCommand,
  TEMPLATE_IDS,
  TYPE_KINDS,
  themeCommand,
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
import { exportCommand } from './export.ts';
import { guideCommand } from './guide.ts';
import { importCommand } from './import.ts';
import { linkShowCommand, varShowCommand } from './show.ts';
import {
  citeAddCommand,
  citeListCommand,
  citeRemoveCommand,
  citeSetCommand,
  referencesCommand,
  sourceAddCommand,
  sourceListCommand,
  sourceLookupCommand,
  sourceRemoveCommand,
  sourceSetCommand,
  sourceShowCommand,
} from './sources.ts';
import {
  imageAddCommand,
  imageRemoveCommand,
  imageSetCommand,
  OVERLAY_TYPES,
  overlayAddCommand,
  overlayMoveCommand,
  overlayRemoveCommand,
  overlaySetCommand,
  sceneAddCommand,
  sceneMoveCommand,
  sceneRemoveCommand,
  sceneSetCommand,
  stepAddCommand,
  stepCopyCommand,
  stepMoveCommand,
  stepRemoveCommand,
  stepSetCommand,
  storyListCommand,
  storyShowCommand,
} from './story.ts';
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

/**
 * A line on the terminal that a long export rewrites as it goes (an empty text clears it). Only on this
 * process's own terminal: nothing when the output goes to a file, another program or a test.
 */
function progressLine(io: Io): ((text: string) => void) | undefined {
  if (io !== processIo || !process.stderr.isTTY) return undefined;
  return (text) =>
    process.stderr.write(
      `
${text}[K`,
    );
}

const VERSION = (
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
).version;

type Run = (handler: () => CommandResult | Promise<CommandResult>) => () => Promise<void>;

const DRY_RUN = 'show what would change, without saving';
const collect = (value: string, previous: string[] = []) => [...previous, value];

/** The `loopweft` command tree. Actions hand their handler to `run`, which decides when and how it runs. */
function createProgram(io: Io, env: () => Env, run: Run): Command {
  const program = new Command('loopweft')
    .description(
      'Build and check Loopweft causal maps (.loopweft files) from the command line. AI agents: read `loopweft guide` first.',
    )
    .version(VERSION)
    .option('--json', 'print one machine-readable JSON document on stdout')
    .showHelpAfterError('(run with --help for usage)')
    .exitOverride()
    .configureOutput({ writeOut: (s) => io.out(s), writeErr: (s) => io.err(s) });

  program
    .command('guide')
    .description(
      'the guide for AI agents: how to build, check and export a map with these commands, and the rules to keep',
    )
    .option(
      '--install <folder>',
      'put the guide in a folder for agents working there: .claude/skills/loopweft/SKILL.md (Claude Code) and AGENTS.md (Codex and others); a file already there is never replaced',
    )
    .action((o) => run(() => guideCommand(o))());

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
    .command('meta <file>')
    .description(
      'show or change what the project says about itself: its title, description, author and course',
    )
    .option('--title <text>', 'the title of the map and its story')
    .option('--description <text>', 'what the map is and is not, e.g. "a qualitative synthesis, not a model"')
    .option('--author <text>', 'who made it')
    .option('--course <text>', 'for which course')
    .option('--clear <fields...>', 'clear these: description, author, course')
    .option('--dry-run', DRY_RUN)
    .action((file: string, o) => run(() => metaCommand(env(), file, o))());

  program
    .command('theme <file>')
    .description('show or change how the project looks: its base theme and its palette')
    .option('--base <theme>', 'cinematic-dark (the default), light or high-contrast')
    .option(
      '--palette <id>',
      `the palette for categories without a colour of their own: ${PALETTE_IDS.join(', ')}, or one of the project's own`,
    )
    .option('--clear <fields...>', 'clear these: base (back to cinematic-dark), palette (back to loopweft)')
    .option('--dry-run', DRY_RUN)
    .action((file: string, o) => run(() => themeCommand(env(), file, o))());

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

  program
    .command('export <file>')
    .description(
      'the project as one HTML file that opens by double-click, offline (a start page, the slides, the presenter console and the sources), as pictures (PNG) or drawings (SVG) of its steps or of the whole map, as PDF documents (the slides, the speaker notes, the references), or as video (MP4 or WebM) of its story',
    )
    .option('--html', 'one HTML file')
    .option(
      '--png',
      'pictures (PNG), drawn in the Chrome or Edge on this computer: --step, --all-steps or --map',
    )
    .option(
      '--svg',
      'drawings (SVG) that stay sharp at any size, open in PowerPoint, Word and Inkscape, and can be edited in Inkscape (and in PowerPoint with --for-office): --step, --all-steps or --map',
    )
    .option(
      '--pdf <document>',
      'a PDF: slides (one 16:9 page per step, drawn in Chrome or Edge), notes (the speaker notes) or references (an APA list with every image credit)',
    )
    .option('--paper <size>', 'pdf: letter (the default) or a4')
    .option(
      '--mp4',
      'video (MP4, H.264, no sound) of the story as the talk plays it, made in the Chrome or Edge on this computer: the whole story, --scene, or --from and --to',
    )
    .option('--webm', 'video as WebM (VP9), for a browser that cannot make MP4')
    .option(
      '--gif',
      'a GIF that loops (960 × 540, 15 frames a second) of a scene or some steps: --scene, or --from and --to',
    )
    .option('--scene <scene>', 'mp4, webm, gif: one scene, by its id or title')
    .option('--from <step>', 'mp4, webm, gif: the first step to play, e.g. S04.2a (with --to)')
    .option('--to <step>', 'mp4, webm, gif: the last step to play (with --from)')
    .option(
      '--hold <seconds>',
      `mp4, webm, gif: how long each step holds once its motion is over (default ${HOLD_DEFAULT})`,
    )
    .option('--talk-timing', "mp4, webm, gif: each step until the next is due, as the talk's timing has it")
    .option('--height <pixels>', 'mp4, webm: 1080 (1920 × 1080, the default) or 720 (1280 × 720)')
    .option('--fps <n>', 'mp4, webm: 30 (the default) or 60 frames a second')
    .option(
      '-o, --out <file>',
      'the file (or, for --all-steps, the folder) to write (default: the project name with .html, -<step>.png or .svg, -map.png or .svg, -steps or -steps-svg, -slides.pdf, -speaker-notes.pdf, -references.pdf, or -story, -<scene> or -<step>-to-<step> with .mp4, .webm or .gif)',
    )
    .option(
      '--no-notes',
      'html: leave out the speaker notes, the script and the cues (an audience-only copy)',
    )
    .option('--step <step>', 'png, svg: the step to draw, e.g. S04.2a, as it stands once its motion is over')
    .option('--all-steps', 'png, svg: every step, one file each, into a new folder')
    .option('--map', 'png, svg: the whole map plainly, without the story (a project needs no story for it)')
    .option('--trim', 'png, svg --map: only the map and a margin, not the whole 16:9 stage')
    .option('--scale <n>', 'png: 1 (1920 × 1080, the default) or 2 (3840 × 2160, for print and posters)')
    .option(
      '--category-words',
      "png, svg, pdf slides, mp4, webm, gif: name each shown variable's category in words, as the C key does",
    )
    .option(
      '--for-office',
      "svg: for PowerPoint and Word: glows drawn as rings of flat colour and faded parts given their own opacity, which PowerPoint's Convert to Shape keeps; the backdrop's darkened edges left out",
    )
    .option('--force', 'replace the output file (or files in the folder) if it exists')
    .action((file: string, o) => run(() => exportCommand(file, o, { progress: progressLine(io) }))());

  const variable = program.command('var').description('variables: list, show, add, set, rm');
  variable
    .command('list <file>')
    .description('list the variables')
    .action((file: string) => run(() => varListCommand(file))());
  variable
    .command('show <file> <variable>')
    .description(
      'a variable in full, named by id or label: its fields, place, citations, links in and out, loops, warnings',
    )
    .action((file: string, ref: string) => run(() => varShowCommand(file, ref))());
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

  const link = program.command('link').description('links: list, show, add, set, rm, flip');
  link
    .command('list <file>')
    .description('list the links')
    .action((file: string) => run(() => linkListCommand(file))());
  link
    .command('show <file> <link>')
    .description('a link in full: its ends, sign, fields, citations, loops and warnings')
    .action((file: string, id: string) => run(() => linkShowCommand(file, id))());
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
      .option('--clear-field <ids...>', 'clear these custom fields')
      .option(
        '--cascade',
        'when new ends break a named loop through the link, take its name off (then name the new loop with loops add)',
      ),
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
    .command('paths <file> <from> <to>')
    .description(
      'the paths from one variable to another along the links, shortest first, with the sign of each',
    )
    .option('--max-length <n>', 'only paths of at most this many links')
    .option('--limit <n>', 'list at most this many paths (default 100); all are counted, up to 100,000')
    .option('--include-optional', 'follow links of optional types too')
    .action((file: string, from: string, to: string, o) => run(() => pathsCommand(file, from, to, o))());

  program
    .command('connected <file>')
    .description('the most-connected variables (connected does not mean leverage)')
    .option('--limit <n>', 'show at most this many (default 10)')
    .option('--include-optional', 'count links of optional types too')
    .action((file: string, o) => run(() => connectedCommand(file, o))());

  const source = program
    .command('source')
    .description('the works the map cites: list, show, lookup, add, set, rm');
  source
    .command('list <file>')
    .description('list the sources, with how often each is cited')
    .action((file: string) => run(() => sourceListCommand(file))());
  source
    .command('show <file> <source>')
    .description('one source in full, and everything that cites or lists it')
    .action((file: string, ref: string) => run(() => sourceShowCommand(file, ref))());
  source
    .command('lookup <doi>')
    .description(
      'look a DOI up at Crossref (or DataCite) and show its APA reference, without adding it (the only network call)',
    )
    .action((doi: string) => run(() => sourceLookupCommand(env(), doi))());
  const sourceOptions = (command: Command) =>
    command
      .option('--label <text>', 'the short in-text form, e.g. "Lawrence et al. (2024)"')
      .option('--url <address>', 'a web address, starting with https://')
      .option('--licence <text>', 'the licence the source states, e.g. "CC BY 4.0"')
      .option('--summary <text>', 'what the map draws from it')
      .option('--part-of <source>', 'for a supplement: the source it belongs to')
      .option('--dry-run', DRY_RUN);
  sourceOptions(
    source
      .command('add <file>')
      .description(
        'add a source: by hand with --apa (works offline), or with --doi alone to fill it in from Crossref or DataCite',
      )
      .option('--apa <text>', 'the full APA 7 reference; *asterisks* mark italics')
      .option('--doi <doi>', 'its DOI (bare, or a doi.org address); without --apa it is looked up')
      .option('--id <id>', 'its id (default: from the first author and year, e.g. lawrence2024)'),
  ).action((file: string, o) => run(() => sourceAddCommand(env(), file, o))());
  sourceOptions(
    source
      .command('set <file> <source>')
      .description('change a source (its id stays)')
      .option('--apa <text>', 'the full APA 7 reference')
      .option('--doi <doi>', 'its DOI (not looked up)')
      .option('--clear <fields...>', 'clear these: label, doi, url, licence, summary, partOf'),
  ).action((file: string, ref: string, o) => run(() => sourceSetCommand(env(), file, ref, o))());
  source
    .command('rm <file> <sources...>')
    .description('remove sources; one still cited or listed needs --cascade')
    .option('--cascade', 'also remove its citations and the scenes’ listings of it')
    .option('--dry-run', DRY_RUN)
    .action((file: string, refs: string[], o) => run(() => sourceRemoveCommand(env(), file, refs, o))());

  const cite = program
    .command('cite')
    .description('citations on variables, links and loops: list, add, set, rm');
  cite
    .command('list <file> [elements...]')
    .description('the citations of these elements (default: of everything that cites a source)')
    .option('--source <source>', 'only citations of this source')
    .option('--uncited', 'instead, the links, variables and named loops that cite nothing')
    .action((file: string, elements: string[], o) => run(() => citeListCommand(file, elements, o))());
  const citeOptions = (command: Command) =>
    command
      .option('--pages <locator>', 'pages or another locator, e.g. 7, 11–12, e11, S4')
      .option(
        '--strength <s>',
        'how strongly it supports the element, in your judgement: strong, moderate or weak',
      )
      .option('--note <text>', 'a figure, table or short quotation, e.g. "Fig. 6c"')
      .option('--dry-run', DRY_RUN);
  citeOptions(
    cite
      .command('add <file> <elements> <source>')
      .description('cite a source on variables, links or loops (ids or variable labels, comma-separated)'),
  ).action((file: string, elements: string, ref: string, o) =>
    run(() => citeAddCommand(env(), file, elements, ref, o))(),
  );
  citeOptions(
    cite
      .command('set <file> <element> <source>')
      .description('change an element’s citation of a source')
      .option(
        '--cited-pages <locator>',
        'which citation, by its pages, when the element cites the source twice',
      )
      .option('--source <source>', 'cite another source instead')
      .option('--clear <fields...>', 'clear these: pages, strength, note'),
  ).action((file: string, element: string, ref: string, o) =>
    run(() => citeSetCommand(env(), file, element, ref, o))(),
  );
  cite
    .command('rm <file> <elements> <source>')
    .description('remove the citation of a source from elements (comma-separated)')
    .option('--cited-pages <locator>', 'which citation, by its pages, when an element cites the source twice')
    .option('--all', 'every citation of the source on these elements')
    .option('--dry-run', DRY_RUN)
    .action((file: string, elements: string, ref: string, o) =>
      run(() => citeRemoveCommand(env(), file, elements, ref, o))(),
    );

  program
    .command('references <file>')
    .description('the APA reference list, made from the sources (supplements under their work)')
    .option('--markdown', 'as a Markdown list, with *italics*')
    .action((file: string, o) => run(() => referencesCommand(file, o))());

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

  const story = program
    .command('story')
    .description('the story: scenes of steps, what each step shows, its overlays and images');
  story
    .command('list <file>')
    .description('the scenes and their steps, in order')
    .action((file: string) => run(() => storyListCommand(file))());
  story
    .command('show <file> <ref>')
    .description('a step in full (S05.3: what its map shows, its overlays, its sources), or a scene (S05)')
    .action((file: string, ref: string) => run(() => storyShowCommand(file, ref))());

  const place = (command: Command, what: 'scene' | 'step') =>
    command
      .option(
        `--before <${what}>`,
        `put it before this ${what} (${what === 'step' ? 'S1.2, or its id or label in that scene' : 'its id or title'})`,
      )
      .option(`--after <${what}>`, `put it after this ${what}`)
      .option('--first', `make it the first ${what}`)
      .option('--last', `make it the last ${what}`);

  const scene = story.command('scene').description('scenes: add, set, rm, move');
  const sceneOptions = (command: Command) =>
    command
      .option('--headline <text>', "the scene's one-line message, shown in its caption")
      .option('--target <seconds>', 'how long the scene should take')
      .option('--notes <markdown>', 'speaker notes (Markdown), for the presenter only')
      .option('--notes-file <file>', 'read the notes from a file')
      .option('--script <text>', 'the full script; [>] marks each keypress')
      .option('--script-file <file>', 'read the script from a file')
      .option('--sources <sources>', 'sources it draws on beyond those its steps light (comma-separated)')
      .option('--dry-run', DRY_RUN);
  sceneOptions(
    place(
      scene
        .command('add <file>')
        .description('add a scene (steps are added with story step add)')
        .requiredOption('--title <title>', 'its title')
        .option('--id <id>', 'its id (default: the next free S<n>)'),
      'scene',
    ),
  ).action((file: string, o) => run(() => sceneAddCommand(env(), file, o))());
  sceneOptions(
    scene
      .command('set <file> <scene>')
      .description('change a scene (its id and steps stay)')
      .option('--title <title>', 'its title')
      .option('--clear <fields...>', 'clear these: headline, target, notes, script, sources'),
  ).action((file: string, ref: string, o) => run(() => sceneSetCommand(env(), file, ref, o))());
  scene
    .command('rm <file> <scene>')
    .description('remove a scene; one with steps needs --cascade')
    .option('--cascade', 'also remove its steps')
    .option('--dry-run', DRY_RUN)
    .action((file: string, ref: string, o) => run(() => sceneRemoveCommand(env(), file, ref, o))());
  place(scene.command('move <file> <scene>').description('move a scene'), 'scene')
    .option('--dry-run', DRY_RUN)
    .action((file: string, ref: string, o) => run(() => sceneMoveCommand(env(), file, ref, o))());

  const step = story.command('step').description('steps: add, set, rm, move, copy');
  const mapOptions = (command: Command) =>
    command
      .option('--map <json>', 'replace the whole map state with this JSON object (applied first)')
      .option('--map-file <file>', 'read that JSON from a file')
      .option(
        '--ripple <variable=up|down>',
        'show what if it rises or falls: it and what the change reaches lit, the rest faded, ▲/▼/± marks and pulses hop by hop (applied after --map; a new step also shows the scene’s caption if its other steps do)',
      )
      .option('--ripple-optional', 'let --ripple follow links of optional types too')
      .option('--hide-map', 'hide the whole map')
      .option('--show-map', 'show the map again')
      .option('--opacity <n>', 'the map’s opacity, 0 to 1')
      .option('--base <level>', `the level of variables not listed: ${LEVELS.join(', ')}`)
      .option('--link-base <level>', 'the level of links not listed')
      .option('--hidden <ids>', 'variables or links to hide (comma-separated ids; variables also by label)')
      .option('--ghost <ids>', 'variables or links to show as ghosts')
      .option('--dim <ids>', 'variables or links to dim')
      .option('--normal <ids>', 'variables or links at normal strength')
      .option('--focus <ids>', 'variables or links to light (focus)')
      .option('--active <ids>', 'variables or links to light most (active)')
      .option('--unlist <ids>', 'put variables or links back to the base level')
      .option('--up <variables>', 'mark ▲ rising')
      .option('--down <variables>', 'mark ▼ falling')
      .option('--mixed <variables>', 'mark ± where opposing influences meet')
      .option('--clear-trend <variables>', 'take their trends away')
      .option(
        '--spread <variable=up|down>',
        'mark a rise or fall and spread it by sign along the lit links (Focus or Active); on a step that lights none, along the whole map, lighting what it reaches',
      )
      .option('--badge <loops>', 'show these loops’ R/B badges')
      .option('--name <loops>', 'show these loops’ names (and badges)')
      .option('--hide-name <loops>', 'hide these loops’ names')
      .option('--hide-badge <loops>', 'hide these loops’ badges and names')
      .option('--clear-pulses', 'take every pulse away (applied before new ones)')
      .option('--pulse-loop <loop>', 'send the pulse round a named loop, one link after another')
      .option(
        '--pulse <links>',
        'add a pulse hop: these links pulse together (repeatable, in order)',
        collect,
      )
      .option('--pulse-with <links>', 'add these links to the last hop')
      .option('--pulse-repeat <n>', 'extra passes of the pulses')
      .option('--pulse-tone <tone>', 'harm, relief or mixed for every pulse (default: by the trends)')
      .option('--pulse-delay <seconds>', 'seconds before the first pulse')
      .option('--frame <variables>', 'frame these variables (comma-separated)')
      .option('--whole-map', 'frame the whole map (or the home view)')
      .option('--frame-at <where>', `where they go on the stage: ${FRAMES.join(', ')}`)
      .option('--max-zoom <n>', 'a zoom limit, so a small group does not fill the screen')
      .option('--labels <which>', 'which labels show: none, focus, view or all')
      .option('--category-labels <on|off>', 'show the group labels')
      .option(
        '--label-text <id=text>',
        'label text for this step only; empty text clears it (repeatable)',
        collect,
      )
      .option('--clear-reveal', 'take the reveal settings away')
      .option('--reveal <mode>', 'how new things arrive: draw (trace in) or bloom (ring by ring)')
      .option('--reveal-from <variables>', 'the variables the reveal grows from')
      .option('--reveal-sequence <ids>', 'an exact order: variables appear, links trace')
      .option('--reveal-stagger <seconds>', 'seconds between beats')
      .option('--reveal-delay <seconds>', 'seconds before the first beat')
      .option('--clear-ambient', 'take the ambient pulses away')
      .option('--ambient <variables>', 'ambient pulses wander from these variables while the step is held')
      .option('--ambient-tone <tone>', 'harm or relief')
      .option('--ambient-every <min,max>', 'seconds between walks')
      .option('--ambient-hops <min,max>', 'links per walk')
      .option('--ambient-delay <seconds>', 'seconds before the first walk')
      .option('--clusters <how>', 'group halos: show, dim or hide')
      .option('--minimap <on|off|auto>', 'the minimap (auto: shown when zoomed in)')
      .option('--dry-run', DRY_RUN);
  mapOptions(
    place(
      step
        .command('add <file> <scene>')
        .description('add a step: without map options it shows the whole map, plainly')
        .requiredOption('--label <label>', 'a short name for the presenter')
        .option('--id <id>', 'its id (default: the next whole number in the scene)')
        .option('--at <seconds>', 'seconds into the scene when it should arrive')
        .option('--cue <text>', 'what happens on it, for the presenter'),
      'step',
    ),
  ).action((file: string, ref: string, o) => run(() => stepAddCommand(env(), file, ref, o))());
  mapOptions(
    step
      .command('set <file> <step>')
      .description('change a step (S05.3): its label, timing and cue, and what its map shows')
      .option('--label <label>', 'a short name for the presenter')
      .option('--at <seconds>', 'seconds into the scene when it should arrive')
      .option('--cue <text>', 'what happens on it, for the presenter')
      .option('--clear <fields...>', 'clear these: at, cue'),
  ).action((file: string, ref: string, o) => run(() => stepSetCommand(env(), file, ref, o))());
  step
    .command('rm <file> <step>')
    .description('remove a step')
    .option('--dry-run', DRY_RUN)
    .action((file: string, ref: string, o) => run(() => stepRemoveCommand(env(), file, ref, o))());
  place(
    step
      .command('move <file> <step>')
      .description('move a step within its scene, or to another (--scene)')
      .option('--scene <scene>', 'move it to this scene'),
    'step',
  )
    .option('--dry-run', DRY_RUN)
    .action((file: string, ref: string, o) => run(() => stepMoveCommand(env(), file, ref, o))());
  place(
    step
      .command('copy <file> <step>')
      .description('copy a step with everything it shows (just after it, unless placed)')
      .requiredOption('--label <label>', 'the copy’s label')
      .option('--scene <scene>', 'put the copy in this scene'),
    'step',
  )
    .option('--dry-run', DRY_RUN)
    .action((file: string, ref: string, o) => run(() => stepCopyCommand(env(), file, ref, o))());

  const overlay = story
    .command('overlay')
    .description('a step’s overlays (counted from 0; later ones draw on top): add, set, rm, move');
  const overlayOptions = (command: Command) =>
    command
      .option('--overlay <json>', 'the overlay’s fields as a JSON object (options below win)')
      .option('--title <text>', 'title: the title; cards: the heading')
      .option('--subtitle <text>', 'title: the subtitle')
      .option('--line <text>', 'title, statement: a line (repeatable)', collect)
      .option('--kicker <text>', 'statement: a small line above, e.g. "INTERVENTION A"')
      .option('--style <style>', 'statement: hero, question, closing, title or note')
      .option('--place <place>', `where on the stage: ${PLACES.join(', ')}`)
      .option(
        '--card <"title | sub | icon">',
        'cards: a card; sub and icon may be left out (repeatable)',
        collect,
      )
      .option('--active <n,...>', 'cards: the highlighted cards, counted from 0')
      .option('--image <id>', 'image: the embedded image (see story image add)')
      .option('--alt <text>', 'image: what it shows, for people who cannot see it')
      .option('--caption <text>', 'image: a caption')
      .option('--credit <text>', 'image: its credit')
      .option('--cite <source[:pages]>', 'a citation (repeatable)', collect)
      .option('--dry-run', DRY_RUN);
  overlayOptions(
    overlay
      .command('add <file> <step> <type>')
      .description(`add an overlay: ${OVERLAY_TYPES.join(', ')}`)
      .option('--index <n>', 'its place in the list (default: last, on top)'),
  ).action((file: string, ref: string, type: string, o) =>
    run(() => overlayAddCommand(env(), file, ref, type, o))(),
  );
  overlayOptions(
    overlay
      .command('set <file> <step> <n>')
      .description('change an overlay (its type stays)')
      .option(
        '--clear <fields...>',
        'clear these: subtitle, lines, kicker, style, place, title, active, caption, credit, citations',
      ),
  ).action((file: string, ref: string, index: string, o) =>
    run(() => overlaySetCommand(env(), file, ref, index, o))(),
  );
  overlay
    .command('rm <file> <step> <n>')
    .description('remove an overlay')
    .option('--dry-run', DRY_RUN)
    .action((file: string, ref: string, index: string, o) =>
      run(() => overlayRemoveCommand(env(), file, ref, index, o))(),
    );
  overlay
    .command('move <file> <step> <n>')
    .description('move an overlay to another place in the list')
    .requiredOption('--to <n>', 'its new place, counted from 0')
    .option('--dry-run', DRY_RUN)
    .action((file: string, ref: string, index: string, o) =>
      run(() => overlayMoveCommand(env(), file, ref, index, o))(),
    );

  const image = story.command('image').description('images embedded for image overlays: add, set, rm');
  image
    .command('add <file> <image>')
    .description('embed a PNG, JPEG, GIF, WebP or SVG image (its id comes from the file name)')
    .option('--id <id>', 'its id')
    .option('--dry-run', DRY_RUN)
    .action((file: string, path: string, o) => run(() => imageAddCommand(env(), file, path, o))());
  image
    .command('set <file> <id> <image>')
    .description('replace an embedded image; every overlay that shows it shows the new one')
    .option('--dry-run', DRY_RUN)
    .action((file: string, id: string, path: string, o) =>
      run(() => imageSetCommand(env(), file, id, path, o))(),
    );
  image
    .command('rm <file> <id>')
    .description('remove an embedded image; one still shown needs --cascade')
    .option('--cascade', 'also remove the overlays that show it')
    .option('--dry-run', DRY_RUN)
    .action((file: string, id: string, o) => run(() => imageRemoveCommand(env(), file, id, o))());

  return program;
}

/** The command tree as written above, runnable by nothing: for listing and describing the commands. */
export function describeProgram(): Command {
  const silent: Io = { out: () => undefined, err: () => undefined };
  return createProgram(
    silent,
    () => ({ today: '' }),
    () => async () => undefined,
  );
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
  walk(describeProgram(), []);
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

/** `help story step set`: commander's help command reaches one level down; this asks the command itself. */
function nestedHelp(argv: string[]): string[] {
  const words = argv.filter((a) => a !== '--json');
  return words[0] === 'help' && words.length > 2 ? [...words.slice(1), '--help'] : argv;
}

/**
 * The first option that takes one value but is given more than once (`--up a --up b`), which commander would
 * read as the last alone, silently. Options that collect (`--line`, `--pulse`) may repeat.
 */
function repeatedOption(program: Command, argv: string[]): string | null {
  let command = program;
  for (const word of argv) {
    if (word.startsWith('-')) continue;
    const sub = command.commands.find((c) => c.name() === word);
    if (!sub) break;
    command = sub;
  }
  const options = [...command.options, ...program.options];
  const seen = new Set<string>();
  for (const arg of argv) {
    if (!arg.startsWith('-') || arg === '--') continue;
    const flag = arg.split('=')[0] as string;
    const option = options.find((o) => o.long === flag || o.short === flag);
    if (!option || option.parseArg || option.variadic || !(option.required || option.optional)) continue;
    const name = option.long ?? flag;
    if (seen.has(name)) return name;
    seen.add(name);
  }
  return null;
}

/** Runs the command line; resolves to the exit code. */
export async function main(given: string[], io: Io = processIo, env?: Env): Promise<number> {
  let result: CommandResult | undefined;
  const argv = nestedHelp(given);
  let json = argv.includes('--json');
  const environment = () => (env ??= { today: today() });
  const program = createProgram(io, environment, (handler) => async () => {
    result = await handler();
  });

  try {
    const repeated = repeatedOption(program, argv);
    if (repeated) {
      throw new OpError(
        `${repeated} is given more than once, and only one counts: give it once (a list goes in one, comma-separated, e.g. ${repeated} a,b).`,
        'usage',
      );
    }
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
