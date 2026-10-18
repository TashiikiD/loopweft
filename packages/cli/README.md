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
| `new <file> --title <t> [--force]` | Creates an empty project |
| `info <file>` | Counts, types, named loops, theme, layout and warnings |
| `validate <file>` | Errors (exit 1) and warnings |
| `add <file> --shorthand "<text>"` or `--shorthand-file <f>` | Adds links written in shorthand (see below) |
| `var list\|add\|set\|rm` | Variables: `add <file> --label <l> [--category] [--role] [--definition] [--map-label] [--size] [--field k=v] [--at x,y]`; `set <file> <variable> … [--clear <fields…>] [--clear-field <ids…>]`; `rm <file> <variables…> [--cascade]` |
| `link list\|add\|set\|rm\|flip` | Links: `add <file> --from <v> --to <v> --sign <+\|-\|?> [--type] [--conditional] [--delay [label]] [--confidence] [--weight] [--rationale] [--field k=v]`; `flip <file> <link>` turns + into − and back |
| `type category\|role\|link\|field add\|set\|rm\|move` | The vocabulary: e.g. `type role add <file> --name Stock --shape rounded-square`, `type field add <file> --name Evidence --kind choice --option explicit=Explicit` |
| `loops list <file> [--max-length n] [--limit n] [--include-optional]` | The loops the map makes, R or B by their signs, and which are named |
| `loops add\|set\|rm` | Named loops: `add <file> --links L1,L2 --name "<n>" [--archetype]` |
| `layout <file> [--auto constellation\|force\|flow [--seed n]] [--move id=x,y] [--pin …] [--unpin …] [--label-side id=side] [--bend link=v] [--clear-bends [links…]] [--home x,y,zoom] [--clear-home]` | Shows the layout, or changes it (in that order) |

Variables are named by id or by label (ignoring case and spacing); a name that matches two is refused.
Values are read strictly: `--weight heavy`, or a field value that is not one of its choices, is refused,
never stored as a guess. A link's sign is required: write `?` when it is not known, and it is flagged.

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
