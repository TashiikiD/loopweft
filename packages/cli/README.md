# @loopweft/cli

`loopweft`, the command line for Loopweft maps: for people, and for AI agents working for people who want
that. Every command runs the same operations as the Studio (`@loopweft/model`'s `ops`), so a map edited
here and one edited by hand follow the same rules.

Inside the repository, run it as `npx loopweft …` (after `npm install`) or `npm run loopweft -- …`. It needs
Node 24, which runs Loopweft's TypeScript source directly.

## Output and exit codes

Add `--json` anywhere on the line: stdout then carries exactly one JSON document, `{ "ok": true, … }` or
`{ "ok": false, "error": { "message", "exitCode", "issues" } }`.

| Exit code | Meaning |
|---|---|
| 0 | Done |
| 1 | The project is invalid, or the change would make it so (`issues` says where) |
| 2 | The command was used wrongly: a missing file, an unknown variable, a removal that something still needs |
| 3 | Internal error (set `LOOPWEFT_DEBUG=1` for a stack trace) |

Edits save only when something changed. `--dry-run` shows what would change without saving. A save is
atomic (written to a temporary file, then moved into place), keeps the previous version as `<file>.bak`,
and stamps `meta.modified` with today's date (`SOURCE_DATE_EPOCH`, in seconds, sets the date instead, so a
run can be repeated byte for byte).

## Commands

| Command | Does |
|---|---|
| `new <file> [--title <t>] [--template <id>] [--force]` | Creates a project: a blank map (it needs `--title`), an archetype or the polycrisis example ([the templates](../../docs/templates.md)) |
| `info <file>` | Counts, types, named loops, theme, layout and warnings |
| `validate <file>` | Errors (exit 1) and warnings |
| `add <file> --shorthand "<text>"` or `--shorthand-file <f>` | Adds links written in shorthand (see below) |
| `var list\|add\|set\|rm` | Variables: `add <file> --label <l> [--category] [--role] [--definition] [--map-label] [--size] [--field k=v] [--at x,y]`; `set <file> <variable> … [--clear <fields…>] [--clear-field <ids…>]`; `rm <file> <variables…> [--cascade]` |
| `link list\|add\|set\|rm\|flip` | Links: `add <file> --from <v> --to <v> --sign <+\|-\|?> [--type] [--conditional] [--delay [label]] [--confidence] [--weight] [--rationale] [--field k=v]`; `flip <file> <link>` turns + into − and back |
| `type category\|role\|link\|field add\|set\|rm\|move` | The vocabulary: e.g. `type role add <file> --name Stock --shape rounded-square`, `type field add <file> --name Evidence --kind choice --option explicit=Explicit` |
| `loops list <file> [--max-length n] [--limit n] [--include-optional]` | The loops the map makes, R or B by their signs, and which are named |
| `loops add\|set\|rm` | Named loops: `add <file> --links L1,L2 --name "<n>" [--archetype]` |
| `ripple <file> <variable> up\|down [--include-optional] [--max-steps n]` | What if a variable rises or falls: which way the change pushes each variable it reaches, by the links' signs, and where it stops ([loops and ripples](../../docs/analysis.md)) |
| `paths <file> <from> <to> [--max-length n] [--limit n] [--include-optional]` | The paths from one variable to another, shortest first, each + or − by its signs; counted up to 100,000 ([paths](../../docs/analysis.md#paths)) |
| `connected <file> [--limit n] [--include-optional]` | The most-connected variables: links in and out, neighbours, named loops. Connected does not mean leverage, and it says so |
| `source list\|show <file> [source]` | The sources, with how often each is cited; `show`: one source in full and everything that cites or lists it |
| `source lookup <doi>` | Looks a DOI up at Crossref (or, when Crossref has no record of it, DataCite) and prints the APA reference it drafts, with notes on what is missing or needs checking, without adding it |
| `source add <file> --apa "<reference>" [--doi] [--id] [--label] [--url] [--licence] [--summary] [--part-of]` | Adds a source by hand (no network) |
| `source add <file> --doi <doi> [--id] [--label] …` | Adds a source from its DOI's record at Crossref or DataCite, and says which; options given beside it replace what the lookup drafted |
| `source set\|rm` | `set <file> <source> … [--clear <fields…>]` (its id stays); `rm <file> <sources…> [--cascade]` (`--cascade` also removes its citations) |
| `cite add <file> <elements> <source> [--pages] [--strength strong\|moderate\|weak] [--note]` | Cites a source on variables, links or loops (comma-separated ids or variable labels); an element that already cites it at those pages is left as it was |
| `cite set\|rm <file> <element(s)> <source>` | `set … [--pages] [--strength] [--note] [--source <other>] [--clear …] [--cited-pages <p>]`; `rm … [--cited-pages <p>] [--all]`. `--cited-pages` says which citation when an element cites the source more than once |
| `cite list <file> [elements…] [--source <s>] [--uncited]` | The citations, of everything or of some elements; `--uncited`: the links, variables and named loops that cite nothing |
| `references <file> [--markdown]` | The APA reference list, made from the sources (see [sources and citations](../../docs/sources.md)) |
| `layout <file> [--auto constellation\|force\|flow [--seed n]] [--move id=x,y] [--pin …] [--unpin …] [--label-side id=side] [--bend link=v] [--clear-bends [links…]] [--home x,y,zoom] [--clear-home]` | Shows the layout, or changes it (in that order) |
| `story list <file>` | The scenes and their steps, in order |
| `story show <file> <step\|scene>` | A step in full (`S05.3`: what its map shows, with its trends in words, its overlays with everything they show and the pages they cite, the sources it draws on, its warnings), or a scene (`S05` or its title, even one with a dot in it: its steps, notes, and script cut at its key marks beside the steps they bring up) |
| `story scene add\|set\|rm\|move` | Scenes: `add <file> --title <t> [--id] [--headline] [--target <s>] [--notes <md>\|--notes-file] [--script <t>\|--script-file] [--sources a,b] [--before\|--after <scene>\|--first\|--last]`; `rm … [--cascade]` (a scene with steps) |
| `story step add <file> <scene> --label <l> [--at <s>] [--cue] [map options]` | Adds a step; without map options it shows the whole map, plainly |
| `story step set <file> <step> [--label] [--at] [--cue] [--clear at cue] [map options]` | Changes a step; the map options (below) change what it shows |
| `story step rm\|move\|copy` | `move <file> <step> [--scene <s>] [--before\|--after <step>\|--first\|--last]`; `copy <file> <step> --label <l>` (a copy with everything it shows, just after it) |
| `story overlay add <file> <step> <type> […]` | Adds a caption, title, statement, cards, legend or image: `--title`, `--subtitle`, `--line` (repeatable), `--kicker`, `--style`, `--place`, `--card "title \| sub \| icon"` (repeatable), `--active 0,2`, `--image <id> --alt <text>`, `--caption`, `--credit`, `--cite source[:pages]` (repeatable), `--overlay <json>`, `--index <n>` |
| `story overlay set\|rm\|move <file> <step> <n>` | Overlays are counted from 0, later ones drawing on top: `set … [fields] [--clear …]`, `move … --to <n>` |
| `story image add\|set\|rm` | Images for image overlays: `add <file> <image> [--id]` (PNG, JPEG, GIF, WebP or SVG, read from the bytes), `set <file> <id> <image>`, `rm <file> <id> [--cascade]` |
| `export <file> --html [-o <file>] [--no-notes] [--force]` | The project as one HTML file that opens by double-click, offline: a start page with the sources, the slides and the presenter console; `--no-notes` leaves out the speaker notes, script and cues (see [presenting and sharing](../../docs/present.md)) |
| `export <file> --png (--step <step>\|--all-steps\|--map [--trim]) [--scale 1\|2] [--category-words] [-o <file>] [--force]` | Pictures (PNG), drawn in the Chrome or Edge on this computer: a step as it stands once its motion is over, every step into a new folder, or the whole map (a project needs no story for it); `--scale 2` for 3840 × 2160 (see [exporting](../../docs/export.md)) |
| `import <file> -o <project> [--format tables\|kumu\|dataviz] [--title] [--sheet Name=variables\|links\|ignore] [--header-row n] [--map Column=target] [--sign-field <field>] [--layout force\|constellation\|flow\|none]` | Makes a project from tables (CSV, TSV, Excel), a Kumu map or a DataViz project, and prints what it could not carry across (see [importing](../../docs/import.md)) |

`source lookup` and `source add --doi` make Loopweft's only network call: they send the DOI, and nothing
else, to Crossref (`https://api.crossref.org/works/<DOI>`) and, when Crossref has no record of it, to
DataCite (`https://api.datacite.org/dois/<DOI>`). A lookup that fails exits 2, with the reason in
`lookup.kind` under `--json`: `invalidDoi`, `offline`, `timeout`, `notFound` (neither agency has it; it may be
registered with another, such as mEDRA or JaLC), `busy` or `badReply`. Nothing is added then; `--apa` adds the
reference by hand, offline.

Variables are named by id or by label (ignoring case and spacing); a name that matches two is refused.
Scenes are named by id or by title, steps by their scene and their own id or label (`S05.3`); `--before` and
`--after` also take a step's id or label alone, in the scene it goes to.
Values are read strictly: `--weight heavy`, or a field value that is not one of its choices, is refused,
never stored as a guess. A link's sign is required: write `?` when it is not known, and it is flagged.

### A step's map options

They change what a step's map shows, applied in this order (see [telling a story](../../docs/story.md)):

| Options | Do |
|---|---|
| `--map <json>`, `--map-file <f>` | Replace the whole map state (first, so the others can refine it) |
| `--hide-map`, `--show-map`, `--opacity <n>` | Hide or show the map, or fade it |
| `--base <level>`, `--link-base <level>` | The level of the variables (links) a step does not list: `hidden`, `ghost`, `dim`, `normal`, `focus`, `active` |
| `--hidden`, `--ghost`, `--dim`, `--normal`, `--focus`, `--active <ids>`, `--unlist <ids>` | Put variables (by id or label) and links (by id) at a level, or back to the base |
| `--up`, `--down`, `--mixed <variables>`, `--clear-trend <variables>` | ▲ ▼ ± trends |
| `--spread <variable>=up\|down` | A what-if: mark a rise or fall and spread it by sign along the lit links |
| `--badge <loops>`, `--name <loops>`, `--hide-name <loops>`, `--hide-badge <loops>` | Loop badges and names (a name shows its badge) |
| `--clear-pulses`, `--pulse-loop <loop>`, `--pulse <links>` (repeatable), `--pulse-with <links>`, `--pulse-repeat <n>`, `--pulse-tone <tone>`, `--pulse-delay <s>` | Pulses: round a named loop, hop by hop, or added to the last hop, and their timing |
| `--frame <variables>`, `--whole-map`, `--frame-at <where>`, `--max-zoom <n>` | The camera: what it frames, where on the stage, and a zoom limit |
| `--labels <which>`, `--category-labels on\|off`, `--label-text <id=text>` | Labels |
| `--reveal draw\|bloom`, `--reveal-from`, `--reveal-sequence`, `--reveal-stagger`, `--reveal-delay`, `--clear-reveal` | How new things arrive |
| `--ambient <variables> --ambient-tone harm\|relief`, `--ambient-every <min,max>`, `--ambient-hops <min,max>`, `--ambient-delay`, `--clear-ambient` | Ambient pulses while the step is held |
| `--clusters show\|dim\|hide`, `--minimap on\|off\|auto` | Group halos and the minimap |

### Shorthand

```text
Births -> Population (+)
Population -> Deaths (+, delay "5 yrs")
Deaths -> Population (-)
Fertility -> Births (?, conf=M)
@group People: Births, Population, Deaths
```

See [the format specification](../../docs/format.md#17-the-shorthand). Nothing is added if any line has an
error; every error is reported at once, with its line and column.

## A session

`test/expected/session.txt` is a whole session, as the tests run it.

Ported from DataViz's command line (`packages/cli` @ `efcdbe2`): its output contract, exit codes and
command conventions.
