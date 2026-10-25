# The `loopweft` command line: reference

Every command, with every option, and examples that were really run. This page is generated from the commands
themselves (`npm run cli-docs`); a test fails when it is out of date, so it always matches this copy of
Loopweft. For a shorter overview see [the command line's README](../packages/cli/README.md); for the file it
edits, [the format](format.md); for working with an AI agent, [the agent guide](agents/SKILL.md).

Inside the repository, run it as `npx loopweft …` (after `npm install`) or `npm run loopweft -- …`. It needs
Node 24. `loopweft help <command>` (or `<command> --help`) prints a command's options.

## How every command answers

- **Plain output** goes to stdout; a failure's message goes to stderr.
- **`--json`**, anywhere on the line, prints exactly one JSON document on stdout instead: `{ "ok": true, … }`
  with the command's results, or `{ "ok": false, "error": { "message", "exitCode", "issues" } }`. `issues` is
  there when there is something to point at: each has a `code`, a `severity` (`error` or `warning`), a
  `message` and a `path` into the project (`["links", 3, "from"]`) or a `line` (shorthand).
- **Exit codes:**

| Exit code | Means | What to do |
|---|---|---|
| 0 | Done | Go on |
| 1 | The project is invalid, or the change would make it so | Read `issues`; fix what they name; nothing was saved |
| 2 | The command was used wrongly: a missing file, an unknown variable, a removal something still needs, a lookup that failed | Read the message; fix the command; nothing was saved |
| 3 | Internal error | Report it; `LOOPWEFT_DEBUG=1` prints a stack trace |

- **Edits** save only when something changed. `--dry-run` shows what would change, without saving. A save is
  atomic (a temporary file moved into place), keeps the previous version as `<file>.bak`, and stamps
  `meta.modified` with today's date (`SOURCE_DATE_EPOCH`, in seconds, sets the date instead, so a run can be
  repeated byte for byte).
- **Naming things:** variables by id or label (ignoring case and spacing; a name that matches two is refused);
  links, loops and sources by id (sources by label too); scenes by id or title; steps as `S1.2` (the scene,
  then the step's own id or label).
- **Values are read strictly.** A sign is required: `+`, `-`, or `?` when it is not known (flagged, never
  guessed). `--weight heavy`, or a field value that is not one of its choices, is refused, not stored.
- **The network:** only `source lookup` and `source add --doi` use it, to send the DOI (and nothing else) to
  Crossref, and then DataCite.

Two failures, as they print:

```console
$ loopweft link add pop.loopweft --from Births --to Nowhere --sign +
No variable "Nowhere".
[exit 2]
```

With `--json`:

```jsonc
{
  "ok": false,
  "error": {
    "message": "No variable \"Nowhere\".",
    "exitCode": 2
  }
}
```

```console
$ loopweft link add pop.loopweft --from Births --to Deaths
error: required option '--sign <sign>' not specified
(run with --help for usage)
[exit 2]
```

With `--json`:

```jsonc
{
  "ok": false,
  "error": {
    "message": "required option '--sign <sign>' not specified",
    "exitCode": 2
  }
}
```

## The example project

Every example starts from a fresh copy of `pop.loopweft`, made by these commands (the source is not a real
work), with `links.csv`, `more.txt` and two one-pixel pictures, `chart.png` and `photo.png`, beside it:

```console
$ loopweft new pop.loopweft --title Population
$ loopweft add pop.loopweft --shorthand 'Births -> Population (+)\nPopulation -> Births (+, delay "20 yrs")\nPopulation -> Deaths (+)\nDeaths -> Population (-)\n@group People: Births, Population, Deaths'
$ loopweft var add pop.loopweft --label Fertility --definition 'Births per woman.'
$ loopweft link add pop.loopweft --from Fertility --to Births --sign +
$ loopweft loops add pop.loopweft --links L2,L1 --name 'More people, more births'
$ loopweft source add pop.loopweft --apa 'Example, A. (2020). *A fictitious source for this reference*. Example Press.' --id example --label 'Example (2020)' --summary 'Not a real work: it shows what a source looks like.'
$ loopweft cite add pop.loopweft L1 example --pages 4
$ loopweft story scene add pop.loopweft --title Growth --headline 'Births feed the population.'
$ loopweft story step add pop.loopweft S1 --label 'The map'
$ loopweft story step add pop.loopweft S1 --label 'The loop' --active L1,L2 --badge R1 --pulse-loop R1
$ loopweft story overlay add pop.loopweft S1.1 caption
$ loopweft story image add pop.loopweft chart.png
$ loopweft story overlay add pop.loopweft S1.1 image --image chart --alt 'A one-pixel picture'
$ loopweft story overlay add pop.loopweft S1.2 caption
$ loopweft story overlay add pop.loopweft S1.2 statement --line 'More people, more births.' --style question --cite example:4
```

## Commands

- [`guide`](#guide): The guide for AI agents: how to build, check and export a map with these commands, and the rules to keep
- [`new`](#new): Create a project file: an empty map, or one made from a template
- [`info`](#info): What a project holds: counts, types, named loops, theme, layout and warnings
- [`validate`](#validate): Check a project: errors (exit 1) and warnings
- [`meta`](#meta): Show or change what the project says about itself: its title, description, author and course
- [`theme`](#theme): Show or change how the project looks: its base theme and its palette
- [`add`](#add): Add links written in shorthand, e.g. "Births -> Population (+)"
- [`import`](#import): Make a .loopweft file from tables (CSV, TSV, Excel), a Kumu map (its JSON export, a blueprint or its spreadsheet), or a DataViz project
- [`export`](#export): The project as one HTML file that opens by double-click, offline (a start page, the slides, the presenter console and the sources), as pictures (PNG) or drawings (SVG) of its steps or of the whole map, as PDF documents (the slides, the speaker notes, the references), or as video (MP4 or WebM) of its story
- [`var list`](#var-list) · [`var add`](#var-add) · [`var set`](#var-set) · [`var rm`](#var-rm): Variables: list, add, set, rm
- [`link list`](#link-list) · [`link add`](#link-add) · [`link set`](#link-set) · [`link rm`](#link-rm) · [`link flip`](#link-flip): Links: list, add, set, rm, flip
- [`type <kind> add`](#type-kind-add) · [`type <kind> set`](#type-kind-set) · [`type <kind> rm`](#type-kind-rm) · [`type <kind> move`](#type-kind-move): The vocabulary: categories, roles, link types and custom fields (add, set, rm, move)
- [`loops list`](#loops-list) · [`loops add`](#loops-add) · [`loops set`](#loops-set) · [`loops rm`](#loops-rm): Feedback loops: list the loops found, and name them
- [`ripple`](#ripple): What if a variable rises (up) or falls (down)? which way the change pushes each variable it reaches, by the signs of the links
- [`paths`](#paths): The paths from one variable to another along the links, shortest first, with the sign of each
- [`connected`](#connected): The most-connected variables (connected does not mean leverage)
- [`source list`](#source-list) · [`source show`](#source-show) · [`source lookup`](#source-lookup) · [`source add`](#source-add) · [`source set`](#source-set) · [`source rm`](#source-rm): The works the map cites: list, show, lookup, add, set, rm
- [`cite list`](#cite-list) · [`cite add`](#cite-add) · [`cite set`](#cite-set) · [`cite rm`](#cite-rm): Citations on variables, links and loops: list, add, set, rm
- [`references`](#references): The APA reference list, made from the sources (supplements under their work)
- [`layout`](#layout): Show or change where things are drawn; edits run in the order of the options below
- [`story list`](#story-list) · [`story show`](#story-show) · [`story scene add`](#story-scene-add) · [`story scene set`](#story-scene-set) · [`story scene rm`](#story-scene-rm) · [`story scene move`](#story-scene-move) · [`story step add`](#story-step-add) · [`story step set`](#story-step-set) · [`story step rm`](#story-step-rm) · [`story step move`](#story-step-move) · [`story step copy`](#story-step-copy) · [`story overlay add`](#story-overlay-add) · [`story overlay set`](#story-overlay-set) · [`story overlay rm`](#story-overlay-rm) · [`story overlay move`](#story-overlay-move) · [`story image add`](#story-image-add) · [`story image set`](#story-image-set) · [`story image rm`](#story-image-rm): The story: scenes of steps, what each step shows, its overlays and images

## `guide`

The guide for AI agents: how to build, check and export a map with these commands, and the rules to keep.

```text
loopweft guide [options]
```

| Option | Means |
|---|---|
| `--install <folder>` | Put the guide in a folder for agents working there: .claude/skills/loopweft/SKILL.md (Claude Code) and AGENTS.md (Codex and others); a file already there is never replaced. |

```console
$ loopweft guide
```

Prints [the guide](agents/SKILL.md) (with `--json`: `{ "ok": true, "guide": "<its text>" }`).

```console
$ loopweft guide --install maps
In maps:
Wrote .claude/skills/loopweft/SKILL.md (for Claude Code).
Wrote AGENTS.md (for Codex and other agents).
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "folder": "maps",
  "files": [
    {
      "path": ".claude/skills/loopweft/SKILL.md",
      "for": "Claude Code",
      "status": "written"
    },
    {
      "path": "AGENTS.md",
      "for": "Codex and other agents",
      "status": "written"
    }
  ]
}
```

## `new`

Create a project file: an empty map, or one made from a template.

```text
loopweft new <file> [options]
```

| Option | Means |
|---|---|
| `--title <title>` | The title of the map (required for a blank map). |
| `--template <id>` | Start from a template: blank, fixes-that-fail, shifting-the-burden, limits-to-growth, tragedy-of-the-commons, escalation, success-to-the-successful, eroding-goals, growth-and-underinvestment, polycrisis. |
| `--force` | Replace an existing file. |

```console
$ loopweft new growth.loopweft --template limits-to-growth
Created growth.loopweft: "Limits to growth" from the template limits-to-growth.
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "file": "growth.loopweft",
  "title": "Limits to growth",
  "template": "limits-to-growth"
}
```

```console
$ loopweft new blank.loopweft --title 'Water supply'
Created blank.loopweft: "Water supply".
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "file": "blank.loopweft",
  "title": "Water supply",
  "template": "blank"
}
```

## `info`

What a project holds: counts, types, named loops, theme, layout and warnings.

```text
loopweft info <file>
```

No options.

```console
$ loopweft info pop.loopweft
Population
  4 variables, 5 links, 1 named loop, 1 source
  types: 1 category, 0 roles, 0 link types, 0 fields
  story: 1 scene, 2 steps
  layout: 0 of 4 placed; home view fitted to the map
  theme: cinematic-dark, palette loopweft
  evidence: 1 of 5 links and 0 of 4 variables cite a source
  4 warnings: uncitedLink 4
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "file": "pop.loopweft",
  "title": "Population",
  "counts": {
    "variables": 4,
    "links": 5,
    "namedLoops": 1,
    "sources": 1,
    "scenes": 1,
    "steps": 2
  },
  "types": {
    "categories": [
      {
        "id": "people",
        "name": "People"
      }
    ],
    "roles": [],
    "linkTypes": [],
    "fields": []
  },
  "theme": {
    "base": "cinematic-dark"
  },
  "layout": {
    "placed": 0,
    "pinned": 0,
    "bends": 0,
    "home": null
  },
  "loops": [
    {
      "id": "R1",
      "name": "More people, more births",
      "polarity": "R",
      "links": [
        "L2",
        "L1"
      ]
    }
  ],
  "evidence": {
    "links": {
      "total": 5,
      "cited": 1
    },
    "variables": {
      "total": 4,
      "cited": 0
    },
    "loops": {
      "total": 1,
      "cited": 0
    },
    "strengths": {
      "strong": 0,
      "moderate": 0,
      "weak": 0,
      "unrated": 1
    },
    "withoutPages": 0
  },
  "issues": {
    "errors": 0,
    "warnings": 4,
    "byCode": {
      "uncitedLink": 4
    }
  }
}
```

## `validate`

Check a project: errors (exit 1) and warnings.

```text
loopweft validate <file>
```

No options.

```console
$ loopweft validate pop.loopweft
warning links[1].citations: Link L2 (population → births) cites no source.
warning links[2].citations: Link L3 (population → deaths) cites no source.
warning links[3].citations: Link L4 (deaths → population) cites no source.
warning links[4].citations: Link L5 (fertility → births) cites no source.
valid: 0 errors, 4 warnings
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "file": "pop.loopweft",
  "valid": true,
  "errors": 0,
  "warnings": 4,
  "issues": [
    {
      "severity": "warning",
      "code": "uncitedLink",
      "message": "Link L2 (population → births) cites no source.",
      "path": [
        "links",
        1,
        "citations"
      ]
    },
    {
      "severity": "warning",
      "code": "uncitedLink",
      "message": "Link L3 (population → deaths) cites no source.",
      "path": [
        "links",
        2,
        "citations"
      ]
    },
    {
      "severity": "warning",
      "code": "uncitedLink",
      "message": "Link L4 (deaths → population) cites no source.",
      "path": [
        "links",
        3,
        "citations"
      ]
    }
    // … 1 more
  ]
}
```

## `meta`

Show or change what the project says about itself: its title, description, author and course.

```text
loopweft meta <file> [options]
```

| Option | Means |
|---|---|
| `--title <text>` | The title of the map and its story. |
| `--description <text>` | What the map is and is not, e.g. "a qualitative synthesis, not a model". |
| `--author <text>` | Who made it. |
| `--course <text>` | For which course. |
| `--clear <fields...>` | Clear these: description, author, course. |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft meta pop.loopweft
title        Population
created      2026-01-01
modified     2026-01-01
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "file": "pop.loopweft",
  "meta": {
    "title": "Population",
    "created": "2026-01-01",
    "modified": "2026-01-01"
  }
}
```

```console
$ loopweft meta pop.loopweft --description 'A sketch of population feedback, not a model.'
Changed the project's description.
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Changed the project's description.",
  "result": {
    "changed": [
      "description"
    ]
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

## `theme`

Show or change how the project looks: its base theme and its palette.

```text
loopweft theme <file> [options]
```

| Option | Means |
|---|---|
| `--base <theme>` | Cinematic-dark (the default), light or high-contrast. |
| `--palette <id>` | The palette for categories without a colour of their own: loopweft, okabe-ito, tol-bright, tol-muted, or one of the project's own. |
| `--clear <fields...>` | Clear these: base (back to cinematic-dark), palette (back to loopweft). |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft theme pop.loopweft
base         cinematic-dark
palette      loopweft (the default)
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "file": "pop.loopweft",
  "theme": {
    "base": "cinematic-dark"
  }
}
```

```console
$ loopweft theme pop.loopweft --base light --palette okabe-ito
Changed the theme: base, palette.
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Changed the theme: base, palette.",
  "result": {
    "changed": [
      "base",
      "palette"
    ]
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

## `add`

Add links written in shorthand, e.g. "Births -> Population (+)".

```text
loopweft add <file> [options]
```

| Option | Means |
|---|---|
| `--shorthand <text>` | Shorthand text (\n separates lines). |
| `--shorthand-file <file>` | Read the shorthand from a file. |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft add pop.loopweft --shorthand 'Food supply -> Births (+, conf=M)\nWar -> Deaths'
Added 2 links and 2 variables from shorthand.
warning line 2, column 5: No sign given for War -> Deaths; recorded as unknown (?).
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Added 2 links and 2 variables from shorthand.",
  "result": {
    "parse": {
      "relations": [
        {
          "line": 1,
          "from": "Food supply",
          "to": "Births",
          "sign": "+",
          "signGiven": true,
          "confidence": "M"
        },
        {
          "line": 2,
          "from": "War",
          "to": "Deaths",
          "sign": "?",
          "signGiven": false
        }
      ],
      "groups": [],
      "issues": [
        {
          "severity": "warning",
          "line": 2,
          "column": 5,
          "message": "No sign given for War -> Deaths; recorded as unknown (?)."
        }
      ],
      "forms": [
        {
          "line": 1,
          "column": 27,
          "name": "conf",
          "key": "confidence"
        }
      ]
    },
    "addedVariables": [
      "food_supply",
      "war"
    ],
    "addedLinks": [
      "L6",
      "L7"
    ],
    "matchedVariables": [
      "births",
      "deaths"
    ],
    "addedCategories": [],
    "warnings": [
      {
        "severity": "warning",
        "line": 2,
        "column": 5,
        "message": "No sign given for War -> Deaths; recorded as unknown (?)."
      }
    ]
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

```console
$ loopweft add pop.loopweft --shorthand-file more.txt --dry-run
Added 1 link and 0 variables from shorthand. (dry run: nothing was saved)
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Added 1 link and 0 variables from shorthand.",
  "result": {
    "parse": {
      "relations": [
        {
          "line": 2,
          "from": "Fertility",
          "to": "Population",
          "sign": "+",
          "signGiven": true,
          "delay": true
        }
      ],
      "groups": [],
      "issues": [],
      "forms": [
        {
          "line": 2,
          "column": 29,
          "name": "delay",
          "key": "delay"
        }
      ]
    },
    "addedVariables": [],
    "addedLinks": [
      "L6"
    ],
    "matchedVariables": [
      "fertility",
      "population"
    ],
    "addedCategories": [],
    "warnings": []
  },
  "changed": true,
  "saved": false,
  "dryRun": true
}
```

## `import`

Make a .loopweft file from tables (CSV, TSV, Excel), a Kumu map (its JSON export, a blueprint or its spreadsheet), or a DataViz project.

```text
loopweft import <input> --out <file> [options]
```

| Option | Means |
|---|---|
| `-o, --out <file>` (required) | The .loopweft file to write. |
| `--format <format>` | Tables, kumu or dataviz (default: worked out from the file). |
| `--title <title>` | The title of the map (default: from the file). |
| `--sheet <name=kind>` | Tables: what a sheet holds: variables, links or ignore (repeatable). |
| `--header-row <n\|sheet=n>` | Tables: the row holding the column names (1 = first; none). |
| `--map <column=target>` | Tables: where a column goes: a field (from, to, sign, label…), ignore, or field:<name>[:<kind>]; Sheet:Column=… for one sheet (repeatable). |
| `--sign-field <field>` | Kumu: the connection field that holds the signs. |
| `--layout <kind>` | Lay out what the file does not place: force (default), constellation, flow or none. |
| `--seed <n>` | The layout seed (default 1337). |
| `--encoding <name>` | Text files: utf-8, windows-1252, utf-16le or utf-16be (default: detected). |
| `--force` | Replace the output file if it exists. |
| `--dry-run` | Read and check the file, without writing. |

```console
$ loopweft import links.csv -o food.loopweft --title Food
Imported 3 variables, 2 links.
3 variables were made from link ends that named no variable: rainfall, crop_yield, food_prices.
No link cites a source yet: Loopweft flags every uncited link.
Read links.csv as links.
Laid out the map with the force layout (seed 1337): moved 3 variables.
Wrote food.loopweft.
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "file": "food.loopweft",
  "format": "tables",
  "counts": {
    "variables": 3,
    "links": 2
  },
  "notes": [
    "Imported 3 variables, 2 links.",
    "3 variables were made from link ends that named no variable: rainfall, crop_yield, food_prices.",
    "No link cites a source yet: Loopweft flags every uncited link."
    // … 2 more
  ],
  "saved": true
}
```

## `export`

The project as one HTML file that opens by double-click, offline (a start page, the slides, the presenter console and the sources), as pictures (PNG) or drawings (SVG) of its steps or of the whole map, as PDF documents (the slides, the speaker notes, the references), or as video (MP4 or WebM) of its story.

```text
loopweft export <file> [options]
```

| Option | Means |
|---|---|
| `--html` | One HTML file. |
| `--png` | Pictures (PNG), drawn in the Chrome or Edge on this computer: --step, --all-steps or --map. |
| `--svg` | Drawings (SVG) that stay sharp at any size, open in PowerPoint, Word and Inkscape, and can be edited in Inkscape (and in PowerPoint with --for-office): --step, --all-steps or --map. |
| `--pdf <document>` | A PDF: slides (one 16:9 page per step, drawn in Chrome or Edge), notes (the speaker notes) or references (an APA list with every image credit). |
| `--paper <size>` | Pdf: letter (the default) or a4. |
| `--mp4` | Video (MP4, H.264, no sound) of the story as the talk plays it, made in the Chrome or Edge on this computer: the whole story, --scene, or --from and --to. |
| `--webm` | Video as WebM (VP9), for a browser that cannot make MP4. |
| `--gif` | A GIF that loops (960 × 540, 15 frames a second) of a scene or some steps: --scene, or --from and --to. |
| `--scene <scene>` | Mp4, webm, gif: one scene, by its id or title. |
| `--from <step>` | Mp4, webm, gif: the first step to play, e.g. S04.2a (with --to). |
| `--to <step>` | Mp4, webm, gif: the last step to play (with --from). |
| `--hold <seconds>` | Mp4, webm, gif: how long each step holds once its motion is over (default 3). |
| `--talk-timing` | Mp4, webm, gif: each step until the next is due, as the talk's timing has it. |
| `--height <pixels>` | Mp4, webm: 1080 (1920 × 1080, the default) or 720 (1280 × 720). |
| `--fps <n>` | Mp4, webm: 30 (the default) or 60 frames a second. |
| `-o, --out <file>` | The file (or, for --all-steps, the folder) to write (default: the project name with .html, -<step>.png or .svg, -map.png or .svg, -steps or -steps-svg, -slides.pdf, -speaker-notes.pdf, -references.pdf, or -story, -<scene> or -<step>-to-<step> with .mp4, .webm or .gif). |
| `--no-notes` | Html: leave out the speaker notes, the script and the cues (an audience-only copy). |
| `--step <step>` | Png, svg: the step to draw, e.g. S04.2a, as it stands once its motion is over. |
| `--all-steps` | Png, svg: every step, one file each, into a new folder. |
| `--map` | Png, svg: the whole map plainly, without the story (a project needs no story for it). |
| `--trim` | Png, svg --map: only the map and a margin, not the whole 16:9 stage. |
| `--scale <n>` | Png: 1 (1920 × 1080, the default) or 2 (3840 × 2160, for print and posters). |
| `--category-words` | Png, svg, pdf slides, mp4, webm, gif: name each shown variable's category in words, as the C key does. |
| `--for-office` | Svg: for PowerPoint and Word: glows drawn as rings of flat colour and faded parts given their own opacity, which PowerPoint's Convert to Shape keeps; the backdrop's darkened edges left out. |
| `--force` | Replace the output file (or files in the folder) if it exists. |

```console
$ loopweft export pop.loopweft --html
Wrote pop.html (1.2 MB): 1 scenes, 2 steps, 1 sources; speaker notes included.
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "file": "pop.loopweft",
  "out": "pop.html",
  "format": "html",
  "bytes": 1243734,
  "notes": true,
  "images": [
    {
      "id": "chart",
      "type": "image/png",
      "bytes": 70
    }
  ],
  "fontsLeftOut": [],
  "warnings": []
}
```

```console
$ loopweft export pop.loopweft --pdf references --paper a4
Wrote pop-references.pdf (references: 1 page, A4, 0.0 MB).
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "file": "pop.loopweft",
  "out": "pop-references.pdf",
  "format": "pdf",
  "document": "references",
  "paper": "a4",
  "pages": 1,
  "bytes": 14558,
  "notes": []
}
```

```console
$ loopweft export pop.loopweft --png --step S1.2
```

Drawn in Chrome or Edge, so not run for this page: see [exporting](export.md).

```console
$ loopweft export pop.loopweft --svg --map --trim
```

Drawn in Chrome or Edge, so not run for this page: see [exporting](export.md).

```console
$ loopweft export pop.loopweft --svg --step S1.2 --for-office
```

Drawn in Chrome or Edge, so not run for this page: see [exporting](export.md).

```console
$ loopweft export pop.loopweft --mp4 --scene Growth
```

Drawn in Chrome or Edge, so not run for this page: see [exporting](export.md).

## `var`

Variables: list, add, set, rm.

### `var list`

List the variables.

```text
loopweft var list <file>
```

No options.

```console
$ loopweft var list pop.loopweft
births                   Births  [people]
population               Population  [people]
deaths                   Deaths  [people]
fertility                Fertility
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "variables": [
    {
      "id": "births",
      "label": "Births",
      "category": "people"
    },
    {
      "id": "population",
      "label": "Population",
      "category": "people"
    },
    {
      "id": "deaths",
      "label": "Deaths",
      "category": "people"
    }
    // … 1 more
  ]
}
```

### `var add`

Add a variable (its id is made from the label unless --id is given).

```text
loopweft var add <file> --label <text> [options]
```

| Option | Means |
|---|---|
| `--label <text>` (required) | Its full name. |
| `--id <id>` | Its id. |
| `--map-label <text>` | A shorter name drawn on the map (\n breaks the line). |
| `--category <id>` | A category id. |
| `--role <id>` | A role id. |
| `--definition <text>` | What rises or falls. |
| `--size <size>` | Normal or large (a hub). |
| `--field <key=value>` | A custom field value (repeatable). |
| `--at <x,y>` | Place it on the map, in map units. |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft var add pop.loopweft --label Mortality --definition 'Deaths per 1,000 people a year.'
Added variable mortality ("Mortality").
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Added variable mortality (\"Mortality\").",
  "result": {
    "id": "mortality"
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

### `var set`

Change a variable, named by id or label (its id stays).

```text
loopweft var set <file> <variable> [options]
```

| Option | Means |
|---|---|
| `--label <text>` | Its full name. |
| `--clear <fields...>` | Clear these: mapLabel, category, role, definition, size. |
| `--clear-field <ids...>` | Clear these custom fields. |
| `--map-label <text>` | A shorter name drawn on the map (\n breaks the line). |
| `--category <id>` | A category id. |
| `--role <id>` | A role id. |
| `--definition <text>` | What rises or falls. |
| `--size <size>` | Normal or large (a hub). |
| `--field <key=value>` | A custom field value (repeatable). |
| `--at <x,y>` | Place it on the map, in map units. |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft var set pop.loopweft Population --size large --map-label 'Popu-\nlation'
Changed variable population: mapLabel, size.
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Changed variable population: mapLabel, size.",
  "result": {
    "id": "population",
    "changed": [
      "mapLabel",
      "size"
    ]
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

### `var rm`

Remove variables; those that links, loops or the story use need --cascade.

```text
loopweft var rm <file> <variables...> [options]
```

| Option | Means |
|---|---|
| `--cascade` | Also remove their links and loops, and their mentions in the story. |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft var rm pop.loopweft Fertility
Variable fertility is still used by 1 link (L5). Remove those first, or remove it with cascade to remove them too.
[exit 2]
```

With `--json`:

```jsonc
{
  "ok": false,
  "error": {
    "message": "Variable fertility is still used by 1 link (L5). Remove those first, or remove it with cascade to remove them too.",
    "exitCode": 2
  }
}
```

```console
$ loopweft var rm pop.loopweft Fertility --cascade
Removed variable fertility with 1 link (L5).
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Removed variable fertility with 1 link (L5).",
  "result": {
    "id": "fertility",
    "removedLinks": [
      "L5"
    ],
    "removedLoops": [],
    "changedSteps": []
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

## `link`

Links: list, add, set, rm, flip.

### `link list`

List the links.

```text
loopweft link list <file>
```

No options.

```console
$ loopweft link list pop.loopweft
L1       births → population (+)
L2       population → births (+)
L3       population → deaths (+)
L4       deaths → population (−)
L5       fertility → births (+)
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "links": [
    {
      "id": "L1",
      "from": "births",
      "to": "population",
      "sign": "+"
    },
    {
      "id": "L2",
      "from": "population",
      "to": "births",
      "sign": "+"
    },
    {
      "id": "L3",
      "from": "population",
      "to": "deaths",
      "sign": "+"
    }
    // … 2 more
  ]
}
```

### `link add`

Add a link between variables named by id or label.

```text
loopweft link add <file> --from <variable> --to <variable> --sign <sign> [options]
```

| Option | Means |
|---|---|
| `--from <variable>` (required) | The cause. |
| `--to <variable>` (required) | The effect. |
| `--sign <sign>` (required) | + (same direction), - (opposite) or ? (not known). |
| `--id <id>` | Its id (default: the next free L<n>). |
| `--type <id>` | A link type id. |
| `--conditional` | The effect holds only under some conditions. |
| `--delay [label]` | The effect takes notably long (optionally how long, e.g. "5 yrs"). |
| `--confidence <level>` | Low, medium or high (L, M, H). |
| `--weight <n>` | Relative strength, 0 or more, for line thickness. |
| `--rationale <text>` | Why the cause moves the effect. |
| `--field <key=value>` | A custom field value (repeatable). |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft link add pop.loopweft --from Population --to Fertility --sign '?'
Added link L6 (population → fertility, ?).
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Added link L6 (population → fertility, ?).",
  "result": {
    "id": "L6"
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

### `link set`

Change a link (its id stays).

```text
loopweft link set <file> <link> [options]
```

| Option | Means |
|---|---|
| `--from <variable>` | The cause. |
| `--to <variable>` | The effect. |
| `--sign <sign>` | +, - or ? |
| `--clear <fields...>` | Clear these: type, conditional, delay, delayLabel, confidence, weight, rationale. |
| `--clear-field <ids...>` | Clear these custom fields. |
| `--cascade` | When new ends break a named loop through the link, take its name off (then name the new loop with loops add). |
| `--type <id>` | A link type id. |
| `--conditional` | The effect holds only under some conditions. |
| `--delay [label]` | The effect takes notably long (optionally how long, e.g. "5 yrs"). |
| `--confidence <level>` | Low, medium or high (L, M, H). |
| `--weight <n>` | Relative strength, 0 or more, for line thickness. |
| `--rationale <text>` | Why the cause moves the effect. |
| `--field <key=value>` | A custom field value (repeatable). |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft link set pop.loopweft L1 --confidence high --rationale 'Each birth adds a person.'
Changed link L1: confidence, rationale.
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Changed link L1: confidence, rationale.",
  "result": {
    "id": "L1",
    "changed": [
      "confidence",
      "rationale"
    ],
    "removedLoops": [],
    "changedSteps": []
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

```console
$ loopweft link set pop.loopweft L1 --from Fertility
Changing L1 breaks 1 named loop through it (R1): its links would no longer close. Change it with cascade to take that name off (then name the new loop with its links), or change the loop first.
[exit 2]
```

With `--json`:

```jsonc
{
  "ok": false,
  "error": {
    "message": "Changing L1 breaks 1 named loop through it (R1): its links would no longer close. Change it with cascade to take that name off (then name the new loop with its links), or change the loop first.",
    "exitCode": 2
  }
}
```

```console
$ loopweft link set pop.loopweft L1 --from Fertility --cascade
Changed link L1: from; took the name off 1 loop it broke (R1): name the new loop with its links; updated 1 story step.
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Changed link L1: from; took the name off 1 loop it broke (R1): name the new loop with its links; updated 1 story step.",
  "result": {
    "id": "L1",
    "changed": [
      "from"
    ],
    "removedLoops": [
      "R1"
    ],
    "changedSteps": [
      "S1.2"
    ]
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

### `link rm`

Remove links; those that loops or the story use need --cascade.

```text
loopweft link rm <file> <links...> [options]
```

| Option | Means |
|---|---|
| `--cascade` | Also remove the loops through them, and their mentions in the story. |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft link rm pop.loopweft L5
Removed link L5 (fertility → births, +).
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Removed link L5 (fertility → births, +).",
  "result": {
    "id": "L5",
    "removedLoops": [],
    "changedSteps": []
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

### `link flip`

Turn + into - or - into + (a ? has nothing to flip).

```text
loopweft link flip <file> <link> [options]
```

| Option | Means |
|---|---|
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft link flip pop.loopweft L4 --dry-run
Flipped L4 (deaths → population) from − to +. (dry run: nothing was saved)
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Flipped L4 (deaths → population) from − to +.",
  "result": {
    "id": "L4",
    "from": "-",
    "to": "+"
  },
  "changed": true,
  "saved": false,
  "dryRun": true
}
```

## `type`

The vocabulary: categories, roles, link types and custom fields (add, set, rm, move).

### `type <kind> add`

Add one of the categories (its id is made from the name unless --id is given).

`<kind>` is one of `category`, `role`, `link`, `field`.

```text
loopweft type <kind> add <file> --name <name> [options]
```

| Option | Means |
|---|---|
| `--name <name>` (required) | Its name. |
| `--id <id>` | Its id. |
| `--description <text>` | What it means. |
| `--colour <#rrggbb>` | Category: its colour (default: from the palette). |
| `--shape <shape>` | Role: circle, ring, square, rounded-square, octagon, diamond, triangle or hexagon. |
| `--response` | Role: marks deliberate responses, such as policies. |
| `--style <style>` | Link type: solid, dashed or dotted. |
| `--marker <marker>` | Link type: none or flag. |
| `--optional` | Link type: not part of the main structure (left out of loop counts). |
| `--kind <kind>` | Field: text, number, choice or boolean. |
| `--applies-to <what>` | Field: variables, links or both. |
| `--option <id=name>` | Field: a choice (repeatable). |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft type category add pop.loopweft --name Economy --colour '#d9a441'
Added category economy ("Economy").
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Added category economy (\"Economy\").",
  "result": {
    "id": "economy"
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

```console
$ loopweft type role add pop.loopweft --name Stock --shape rounded-square
Added role stock ("Stock").
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Added role stock (\"Stock\").",
  "result": {
    "id": "stock"
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

```console
$ loopweft type link add pop.loopweft --name 'Side effect' --style dashed --optional
Added link type side_effect ("Side effect").
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Added link type side_effect (\"Side effect\").",
  "result": {
    "id": "side_effect"
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

```console
$ loopweft type field add pop.loopweft --name Evidence --kind choice --applies-to links --option explicit=Explicit --option synthesis=Synthesis
Added field evidence ("Evidence").
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Added field evidence (\"Evidence\").",
  "result": {
    "id": "evidence"
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

### `type <kind> set`

Change one, named by id or name (its id stays).

`<kind>` is one of `category`, `role`, `link`, `field`.

```text
loopweft type <kind> set <file> <ref> [options]
```

| Option | Means |
|---|---|
| `--name <name>` | Its name. |
| `--clear <fields...>` | Clear these fields. |
| `--description <text>` | What it means. |
| `--colour <#rrggbb>` | Category: its colour (default: from the palette). |
| `--shape <shape>` | Role: circle, ring, square, rounded-square, octagon, diamond, triangle or hexagon. |
| `--response` | Role: marks deliberate responses, such as policies. |
| `--style <style>` | Link type: solid, dashed or dotted. |
| `--marker <marker>` | Link type: none or flag. |
| `--optional` | Link type: not part of the main structure (left out of loop counts). |
| `--kind <kind>` | Field: text, number, choice or boolean. |
| `--applies-to <what>` | Field: variables, links or both. |
| `--option <id=name>` | Field: a choice (repeatable). |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft type category set pop.loopweft People --description 'Who lives here.'
Changed category people: description.
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Changed category people: description.",
  "result": {
    "id": "people",
    "changed": [
      "description"
    ]
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

### `type <kind> rm`

Remove one; one still in use needs --cascade.

`<kind>` is one of `category`, `role`, `link`, `field`.

```text
loopweft type <kind> rm <file> <ref> [options]
```

| Option | Means |
|---|---|
| `--cascade` | Also clear its uses. |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft type category rm pop.loopweft People
Category people is still used: 3 variables (births, population, deaths) use it. Change those first, or remove it with cascade to clear them.
[exit 2]
```

With `--json`:

```jsonc
{
  "ok": false,
  "error": {
    "message": "Category people is still used: 3 variables (births, population, deaths) use it. Change those first, or remove it with cascade to clear them.",
    "exitCode": 2
  }
}
```

```console
$ loopweft type category rm pop.loopweft People --cascade
Removed category people; cleared it from 3 variables (births, population, deaths).
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Removed category people; cleared it from 3 variables (births, population, deaths).",
  "result": {
    "id": "people",
    "cleared": {
      "variables": [
        "births",
        "population",
        "deaths"
      ]
    }
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

### `type <kind> move`

Move one to another place in its list (the order of colours and clusters).

`<kind>` is one of `category`, `role`, `link`, `field`.

```text
loopweft type <kind> move <file> <ref> --to <position> [options]
```

| Option | Means |
|---|---|
| `--to <position>` (required) | Its new place, 1 = first. |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft type category move pop.loopweft People --to 1
Nothing to change: category people is already in place 1.
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Nothing to change: category people is already in place 1.",
  "result": {
    "id": "people",
    "from": 0,
    "to": 0
  },
  "changed": false,
  "saved": false
}
```

## `loops`

Feedback loops: list the loops found, and name them.

### `loops list`

The loops the map makes, each R (reinforcing), B (balancing) or ? (a link of unknown sign).

```text
loopweft loops list <file> [options]
```

| Option | Means |
|---|---|
| `--max-length <n>` | Only loops of at most this many links. |
| `--limit <n>` | Stop listing after this many loops (default 1000). |
| `--include-optional` | Count links of optional types too. |

```console
$ loopweft loops list pop.loopweft
2 loops (1 reinforcing, 1 balancing)
R  births → population → births  (L1 L2)  named R1 "More people, more births"
B  deaths → population → deaths  (L4 L3)
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "stats": {
    "count": 2,
    "reinforcing": 1,
    "balancing": 1,
    "unknown": 0,
    "byLength": {
      "2": 2
    },
    "capped": false
  },
  "loops": [
    {
      "polarity": "R",
      "links": [
        "L1",
        "L2"
      ],
      "variables": [
        "births",
        "population"
      ],
      "named": {
        "id": "R1",
        "name": "More people, more births"
      }
    },
    {
      "polarity": "B",
      "links": [
        "L4",
        "L3"
      ],
      "variables": [
        "deaths",
        "population"
      ]
    }
  ],
  "named": [
    {
      "id": "R1",
      "name": "More people, more births",
      "polarity": "R",
      "links": [
        "L2",
        "L1"
      ]
    }
  ]
}
```

### `loops add`

Name a loop: its links in order round the loop (see loops list).

```text
loopweft loops add <file> --links <ids> --name <name> [options]
```

| Option | Means |
|---|---|
| `--links <ids>` (required) | Link ids, comma-separated, in order. |
| `--name <name>` (required) | Its name. |
| `--id <id>` | Its id (default: R<n> or B<n> by its polarity). |
| `--archetype <name>` | A system archetype it follows, e.g. "Fixes that fail". |
| `--description <text>` | What the loop does. |
| `--caution <text>` | What it does not show. |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft loops add pop.loopweft --links L3,L4 --name 'Deaths balance births'
Named loop B1 ("Deaths balance births"): 2 links, balancing.
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Named loop B1 (\"Deaths balance births\"): 2 links, balancing.",
  "result": {
    "id": "B1",
    "polarity": "B"
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

### `loops set`

Change a named loop (its id stays).

```text
loopweft loops set <file> <loop> [options]
```

| Option | Means |
|---|---|
| `--name <name>` | Its name. |
| `--links <ids>` | Its links, in order. |
| `--clear <fields...>` | Clear these: archetype, description, caution. |
| `--archetype <name>` | A system archetype it follows, e.g. "Fixes that fail". |
| `--description <text>` | What the loop does. |
| `--caution <text>` | What it does not show. |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft loops set pop.loopweft R1 --description 'Each generation has more parents.'
Changed loop R1: description.
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Changed loop R1: description.",
  "result": {
    "id": "R1",
    "changed": [
      "description"
    ]
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

### `loops rm`

Remove a named loop (its links stay); one the story shows needs --cascade.

```text
loopweft loops rm <file> <loop> [options]
```

| Option | Means |
|---|---|
| `--cascade` | Also remove it from the story steps that show it. |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft loops rm pop.loopweft R1 --cascade
Removed loop R1 ("More people, more births"); updated 1 story step. Its links stay.
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Removed loop R1 (\"More people, more births\"); updated 1 story step. Its links stay.",
  "result": {
    "id": "R1",
    "changedSteps": [
      "S1.2"
    ]
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

## `ripple`

What if a variable rises (up) or falls (down)? which way the change pushes each variable it reaches, by the signs of the links.

```text
loopweft ripple <file> <variable> <direction> [options]
```

| Option | Means |
|---|---|
| `--include-optional` | Follow links of optional types too. |
| `--max-steps <n>` | Go no further than this many links from the start. |

```console
$ loopweft ripple pop.loopweft Births up
For a rise in Births, the change reaches 2 variables in 2 steps: 2 variables rising ▲.
  step 1  ▲ Population: rising, via L1
  step 2  ▲ Deaths: rising, via L3
Back to Births at step 2 along L2: ▲ rising, the same way, so the loop reinforces the change.
Pushed the other way later, round a loop or by a longer way: Population (L4).
Directions only, from the links' signs: not how much or how soon.
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "start": "births",
  "direction": "up",
  "reached": [
    {
      "variable": "population",
      "trend": "up",
      "step": 1,
      "via": [
        "L1"
      ],
      "against": [
        "L4"
      ]
    },
    {
      "variable": "deaths",
      "trend": "up",
      "step": 2,
      "via": [
        "L3"
      ],
      "against": []
    }
  ],
  "hops": [
    [
      "L1"
    ],
    [
      "L3"
    ]
  ],
  "feedback": [
    {
      "link": "L2",
      "trend": "up",
      "step": 2
    }
  ],
  "unknownLinks": [],
  "optionalLinks": [],
  "capped": false
}
```

## `paths`

The paths from one variable to another along the links, shortest first, with the sign of each.

```text
loopweft paths <file> <from> <to> [options]
```

| Option | Means |
|---|---|
| `--max-length <n>` | Only paths of at most this many links. |
| `--limit <n>` | List at most this many paths (default 100); all are counted, up to 100,000. |
| `--include-optional` | Follow links of optional types too. |

```console
$ loopweft paths pop.loopweft Fertility Deaths
1 path leads from Fertility to Deaths: 1 + (same direction). The shortest has 3 links.
  +  Fertility → Births → Population → Deaths  (L5, L1, L3)
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "from": "fertility",
  "to": "deaths",
  "paths": [
    {
      "links": [
        "L5",
        "L1",
        "L3"
      ],
      "variables": [
        "fertility",
        "births",
        "population"
        // … 1 more
      ],
      "sign": "+"
    }
  ],
  "count": 1,
  "complete": true,
  "signs": {
    "+": 1,
    "-": 0,
    "?": 0
  },
  "shortest": 3,
  "maxLength": 3,
  "optionalLeftOut": []
}
```

## `connected`

The most-connected variables (connected does not mean leverage).

```text
loopweft connected <file> [options]
```

| Option | Means |
|---|---|
| `--limit <n>` | Show at most this many (default 10). |
| `--include-optional` | Count links of optional types too. |

```console
$ loopweft connected pop.loopweft --limit 3
The 3 most-connected variables, by links in and out:
  variable    links   in  out  neighbours  named loops
  Population      4    2    2           2            1
  Births          3    2    1           2            1
  Deaths          2    1    1           1            0
Connected does not mean leverage. A variable with many links is not, for that reason, a good place to intervene: how much a change there matters depends on what a count of links cannot show, such as how strong each influence is, its delays, which loops dominate, and what can actually be changed.
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "variables": [
    {
      "id": "population",
      "label": "Population",
      "in": 2,
      "out": 2,
      "links": 4,
      "neighbours": 2,
      "namedLoops": 1
    },
    {
      "id": "births",
      "label": "Births",
      "in": 2,
      "out": 1,
      "links": 3,
      "neighbours": 2,
      "namedLoops": 1
    },
    {
      "id": "deaths",
      "label": "Deaths",
      "in": 1,
      "out": 1,
      "links": 2,
      "neighbours": 1,
      "namedLoops": 0
    }
  ],
  "caveat": "Connected does not mean leverage. A variable with many links is not, for that reason, a good place to intervene: how much a change there matters depends on what a count of links cannot show, such as how strong each influence is, its delays, which loops dominate, and what can actually be changed.",
  "optionalLeftOut": []
}
```

## `source`

The works the map cites: list, show, lookup, add, set, rm.

### `source list`

List the sources, with how often each is cited.

```text
loopweft source list <file>
```

No options.

```console
$ loopweft source list pop.loopweft
example  Example (2020)  (1 citation; in the story 1 time)
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "sources": [
    {
      "id": "example",
      "label": "Example (2020)",
      "apa": "Example, A. (2020). *A fictitious source for this reference*. Example Press.",
      "citations": 1,
      "elements": 1,
      "story": 1
    }
  ]
}
```

### `source show`

One source in full, and everything that cites or lists it.

```text
loopweft source show <file> <source>
```

No options.

```console
$ loopweft source show pop.loopweft example
example: Example (2020)
  Example, A. (2020). A fictitious source for this reference. Example Press.
  summary: Not a real work: it shows what a source looks like.
  used 2 times:
    link L1: example p. 4
    overlay S1.2 overlay 2: example p. 4
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "source": {
    "id": "example",
    "label": "Example (2020)",
    "apa": "Example, A. (2020). *A fictitious source for this reference*. Example Press.",
    "summary": "Not a real work: it shows what a source looks like."
  },
  "uses": [
    {
      "kind": "link",
      "id": "L1",
      "citation": {
        "source": "example",
        "pages": "4"
      }
    },
    {
      "kind": "overlay",
      "id": "S1.2",
      "where": "S1.2 overlay 2",
      "citation": {
        "source": "example",
        "pages": "4"
      }
    }
  ]
}
```

### `source lookup`

Look a DOI up at Crossref (or DataCite) and show its APA reference, without adding it (the only network call).

```text
loopweft source lookup <doi>
```

No options.

```console
$ loopweft source lookup 10.1017/sus.2024.1
Lawrence, M., Homer-Dixon, T., Janzwood, S., Rockström, J., Renn, O., & Donges, J. F. (2024). Global polycrisis: The causal mechanisms of crisis entanglement. *Global Sustainability*, *7*, Article e6. https://doi.org/10.1017/sus.2024.1
  label: Lawrence et al. (2024)
  licence: CC BY 4.0
  from Crossref, type: journal-article
  check: Crossref records a correction to this work (10.1017/sus.2024.48, 2024-01-17): check whether it changes what the map cites.
[exit 0]
```

Answered here from a recorded Crossref reply; the command itself asks Crossref.

With `--json`:

```jsonc
{
  "ok": true,
  "draft": {
    "doi": "10.1017/sus.2024.1",
    "apa": "Lawrence, M., Homer-Dixon, T., Janzwood, S., Rockström, J., Renn, O., & Donges, J. F. (2024). Global polycrisis: The causal mechanisms of crisis entanglement. *Global Sustainability*, *7*, Article e6. https://doi.org/10.1017/sus.2024.1",
    "label": "Lawrence et al. (2024)",
    "licence": "CC BY 4.0",
    "agency": "Crossref",
    "type": "journal-article",
    "year": "2024",
    "notes": [
      {
        "level": "check",
        "message": "Crossref records a correction to this work (10.1017/sus.2024.48, 2024-01-17): check whether it changes what the map cites."
      }
    ]
  }
}
```

### `source add`

Add a source: by hand with --apa (works offline), or with --doi alone to fill it in from Crossref or DataCite.

```text
loopweft source add <file> [options]
```

| Option | Means |
|---|---|
| `--apa <text>` | The full APA 7 reference; *asterisks* mark italics. |
| `--doi <doi>` | Its DOI (bare, or a doi.org address); without --apa it is looked up. |
| `--id <id>` | Its id (default: from the first author and year, e.g. lawrence2024). |
| `--label <text>` | The short in-text form, e.g. "Lawrence et al. (2024)". |
| `--url <address>` | A web address, starting with https://. |
| `--licence <text>` | The licence the source states, e.g. "CC BY 4.0". |
| `--summary <text>` | What the map draws from it. |
| `--part-of <source>` | For a supplement: the source it belongs to. |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft source add pop.loopweft --doi 10.1017/sus.2024.1 --id L
Added source L (Lawrence et al. (2024)).
  Lawrence, M., Homer-Dixon, T., Janzwood, S., Rockström, J., Renn, O., & Donges, J. F. (2024). Global polycrisis: The causal mechanisms of crisis entanglement. *Global Sustainability*, *7*, Article e6. https://doi.org/10.1017/sus.2024.1
  from Crossref, type: journal-article
  check before citing:
    check: Crossref records a correction to this work (10.1017/sus.2024.48, 2024-01-17): check whether it changes what the map cites.
[exit 0]
```

Answered here from a recorded Crossref reply; the command itself asks Crossref.

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Added source L (Lawrence et al. (2024)).",
  "result": {
    "id": "L"
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak",
  "lookup": {
    "agency": "Crossref",
    "type": "journal-article",
    "notes": [
      {
        "level": "check",
        "message": "Crossref records a correction to this work (10.1017/sus.2024.48, 2024-01-17): check whether it changes what the map cites."
      }
    ]
  }
}
```

```console
$ loopweft source add pop.loopweft --apa 'Example, B. (2021). *Another fictitious source*. Example Press.' --label 'Example (2021)'
Added source example2021 (Example (2021)).
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Added source example2021 (Example (2021)).",
  "result": {
    "id": "example2021"
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

### `source set`

Change a source (its id stays).

```text
loopweft source set <file> <source> [options]
```

| Option | Means |
|---|---|
| `--apa <text>` | The full APA 7 reference. |
| `--doi <doi>` | Its DOI (not looked up). |
| `--clear <fields...>` | Clear these: label, doi, url, licence, summary, partOf. |
| `--label <text>` | The short in-text form, e.g. "Lawrence et al. (2024)". |
| `--url <address>` | A web address, starting with https://. |
| `--licence <text>` | The licence the source states, e.g. "CC BY 4.0". |
| `--summary <text>` | What the map draws from it. |
| `--part-of <source>` | For a supplement: the source it belongs to. |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft source set pop.loopweft example --licence 'CC BY 4.0'
Changed source example: licence.
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Changed source example: licence.",
  "result": {
    "id": "example",
    "changed": [
      "licence"
    ]
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

### `source rm`

Remove sources; one still cited or listed needs --cascade.

```text
loopweft source rm <file> <sources...> [options]
```

| Option | Means |
|---|---|
| `--cascade` | Also remove its citations and the scenes’ listings of it. |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft source rm pop.loopweft example
Source example is still cited by 1 link (L1) and cited by 1 overlay (S1.2 overlay 2). Remove those first, or remove it with cascade to remove them too.
[exit 2]
```

With `--json`:

```jsonc
{
  "ok": false,
  "error": {
    "message": "Source example is still cited by 1 link (L1) and cited by 1 overlay (S1.2 overlay 2). Remove those first, or remove it with cascade to remove them too.",
    "exitCode": 2
  }
}
```

```console
$ loopweft source rm pop.loopweft example --cascade --dry-run
Removed source example with 2 citations. (dry run: nothing was saved)
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Removed source example with 2 citations.",
  "result": {
    "id": "example",
    "removedCitations": 2,
    "changedScenes": []
  },
  "changed": true,
  "saved": false,
  "dryRun": true
}
```

## `cite`

Citations on variables, links and loops: list, add, set, rm.

### `cite list`

The citations of these elements (default: of everything that cites a source).

```text
loopweft cite list <file> [elements...] [options]
```

| Option | Means |
|---|---|
| `--source <source>` | Only citations of this source. |
| `--uncited` | Instead, the links, variables and named loops that cite nothing. |

```console
$ loopweft cite list pop.loopweft
L1    example p. 4
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "citations": [
    {
      "kind": "link",
      "id": "L1",
      "citations": [
        {
          "source": "example",
          "pages": "4"
        }
      ]
    }
  ]
}
```

```console
$ loopweft cite list pop.loopweft --uncited
1 of 5 links cite a source; citing nothing:
  L2  Population → Births
  L3  Population → Deaths
  L4  Deaths → Population
  L5  Fertility → Births
0 of 4 variables cite a source; citing nothing:
  births  Births
  population  Population
  deaths  Deaths
  fertility  Fertility
0 of 1 named loop cite a source; citing nothing:
  R1  More people, more births
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "links": {
    "total": 5,
    "cited": 1,
    "uncited": [
      "L2",
      "L3",
      "L4"
      // … 1 more
    ]
  },
  "variables": {
    "total": 4,
    "cited": 0,
    "uncited": [
      "births",
      "population",
      "deaths"
      // … 1 more
    ]
  },
  "loops": {
    "total": 1,
    "cited": 0,
    "uncited": [
      "R1"
    ]
  }
}
```

### `cite add`

Cite a source on variables, links or loops (ids or variable labels, comma-separated).

```text
loopweft cite add <file> <elements> <source> [options]
```

| Option | Means |
|---|---|
| `--pages <locator>` | Pages or another locator, e.g. 7, 11–12, e11, S4. |
| `--strength <s>` | How strongly it supports the element, in your judgement: strong, moderate or weak. |
| `--note <text>` | A figure, table or short quotation, e.g. "Fig. 6c". |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft cite add pop.loopweft L2,Births example --pages 5–6 --strength moderate
Cited example pp. 5–6 on L2 and births.
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Cited example pp. 5–6 on L2 and births.",
  "result": {
    "source": "example",
    "added": [
      "L2",
      "births"
    ],
    "skipped": []
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

### `cite set`

Change an element’s citation of a source.

```text
loopweft cite set <file> <element> <source> [options]
```

| Option | Means |
|---|---|
| `--cited-pages <locator>` | Which citation, by its pages, when the element cites the source twice. |
| `--source <source>` | Cite another source instead. |
| `--clear <fields...>` | Clear these: pages, strength, note. |
| `--pages <locator>` | Pages or another locator, e.g. 7, 11–12, e11, S4. |
| `--strength <s>` | How strongly it supports the element, in your judgement: strong, moderate or weak. |
| `--note <text>` | A figure, table or short quotation, e.g. "Fig. 6c". |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft cite set pop.loopweft L1 example --note 'Fig. 2'
Changed L1's citation of example: note.
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Changed L1's citation of example: note.",
  "result": {
    "element": "L1",
    "index": 0,
    "changed": [
      "note"
    ]
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

### `cite rm`

Remove the citation of a source from elements (comma-separated).

```text
loopweft cite rm <file> <elements> <source> [options]
```

| Option | Means |
|---|---|
| `--cited-pages <locator>` | Which citation, by its pages, when an element cites the source twice. |
| `--all` | Every citation of the source on these elements. |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft cite rm pop.loopweft L1 example
Removed L1's citation of example p. 4.
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Removed L1's citation of example p. 4.",
  "result": {
    "element": "L1",
    "index": 0,
    "source": "example"
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

## `references`

The APA reference list, made from the sources (supplements under their work).

```text
loopweft references <file> [options]
```

| Option | Means |
|---|---|
| `--markdown` | As a Markdown list, with *italics*. |

```console
$ loopweft references pop.loopweft
Example, A. (2020). A fictitious source for this reference. Example Press. (Scene 1)
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "references": [
    {
      "id": "example",
      "apa": "Example, A. (2020). *A fictitious source for this reference*. Example Press.",
      "scenes": [
        "S1"
      ],
      "parts": []
    }
  ]
}
```

## `layout`

Show or change where things are drawn; edits run in the order of the options below.

```text
loopweft layout <file> [options]
```

| Option | Means |
|---|---|
| `--auto <kind>` | Lay the map out: constellation (by category), force or flow; pinned variables stay. |
| `--seed <n>` | With --auto: the seed (default 1337); the same seed gives the same layout. |
| `--move <id=x,y>` | Move a variable, in map units (repeatable). |
| `--pin <variables...>` | Pin variables: automatic layouts leave them where they are. |
| `--unpin <variables...>` | Unpin variables. |
| `--label-side <id=side>` | Above, below, left, right or auto (repeatable). |
| `--bend <link=value>` | Set a curve, -1 to 1, positive bends left (repeatable). |
| `--clear-bends [links...]` | Curve these links (or every link) automatically again. |
| `--home <x,y,zoom>` | Set the whole-map view: its centre in map units and its zoom. |
| `--clear-home` | Fit the whole map instead of a home view. |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft layout pop.loopweft --auto flow
Laid out the map as a flow from causes to effects: moved 4 variables.
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Laid out the map as a flow from causes to effects: moved 4 variables.",
  "result": {
    "moved": [
      "births",
      "population",
      "deaths"
      // … 1 more
    ],
    "pinned": [],
    "groups": {
      "removed": [],
      "added": []
    },
    "kind": "flow",
    "seed": 1337
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

```console
$ loopweft layout pop.loopweft
not placed (drawn by an automatic layout): births, population, deaths, fertility
curves set by hand: 0; groups: 0
home view: fitted to the map
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "positions": {},
  "unplaced": [
    "births",
    "population",
    "deaths"
    // … 1 more
  ],
  "bends": {},
  "groups": [],
  "home": null
}
```

## `story`

The story: scenes of steps, what each step shows, its overlays and images.

### `story list`

The scenes and their steps, in order.

```text
loopweft story list <file>
```

No options.

```console
$ loopweft story list pop.loopweft
Story: 1 scene, 2 steps
S1  Growth (untimed) · 2 steps
  S1.1       The map
  S1.2       The loop
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "scenes": [
    {
      "id": "S1",
      "title": "Growth",
      "steps": [
        {
          "id": "1",
          "key": "S1.1",
          "label": "The map"
        },
        {
          "id": "2",
          "key": "S1.2",
          "label": "The loop"
        }
      ]
    }
  ],
  "warnings": 0
}
```

### `story show`

A step in full (S05.3: what its map shows, its overlays, its sources), or a scene (S05).

```text
loopweft story show <file> <ref>
```

No options.

```console
$ loopweft story show pop.loopweft S1.2
S1.2 "The loop": step 2 of 2 in scene S1 ("Growth")
Map:
  variables: base normal
  links: base normal · active L1, L2
  camera: the whole map
  labels: view
  loop badges: R1
  pulses: L2 → L1
Overlays (counted from 0, later ones on top):
  0 caption: 01 · "Growth" · headline "Births feed the population."
  1 statement (question) · lines "More people, more births." · cites example p. 4
Sources it draws on: example
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "key": "S1.2",
  "scene": "S1",
  "step": {
    "id": "2",
    "label": "The loop",
    "map": {
      "links": {
        "active": [
          "L1",
          "L2"
        ]
      },
      "loops": [
        "R1"
      ],
      "pulses": {
        "hops": [
          [
            "L2"
          ],
          [
            "L1"
          ]
        ]
      }
    },
    "overlays": [
      {
        "type": "caption"
      },
      {
        "type": "statement",
        "lines": [
          "More people, more births."
        ],
        "style": "question",
        "citations": [
          {
            "source": "example",
            "pages": "4"
          }
        ]
      }
    ]
  },
  "sources": [
    "example"
  ],
  "warnings": []
}
```

### `story scene add`

Add a scene (steps are added with story step add).

```text
loopweft story scene add <file> --title <title> [options]
```

| Option | Means |
|---|---|
| `--title <title>` (required) | Its title. |
| `--id <id>` | Its id (default: the next free S<n>). |
| `--before <scene>` | Put it before this scene (its id or title). |
| `--after <scene>` | Put it after this scene. |
| `--first` | Make it the first scene. |
| `--last` | Make it the last scene. |
| `--headline <text>` | The scene's one-line message, shown in its caption. |
| `--target <seconds>` | How long the scene should take. |
| `--notes <markdown>` | Speaker notes (Markdown), for the presenter only. |
| `--notes-file <file>` | Read the notes from a file. |
| `--script <text>` | The full script; [>] marks each keypress. |
| `--script-file <file>` | Read the script from a file. |
| `--sources <sources>` | Sources it draws on beyond those its steps light (comma-separated). |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft story scene add pop.loopweft --title Limits --target 45 --first
Added scene S2 ("Limits"), scene 1 of 2.
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Added scene S2 (\"Limits\"), scene 1 of 2.",
  "result": {
    "id": "S2",
    "index": 0
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

### `story scene set`

Change a scene (its id and steps stay).

```text
loopweft story scene set <file> <scene> [options]
```

| Option | Means |
|---|---|
| `--title <title>` | Its title. |
| `--clear <fields...>` | Clear these: headline, target, notes, script, sources. |
| `--headline <text>` | The scene's one-line message, shown in its caption. |
| `--target <seconds>` | How long the scene should take. |
| `--notes <markdown>` | Speaker notes (Markdown), for the presenter only. |
| `--notes-file <file>` | Read the notes from a file. |
| `--script <text>` | The full script; [>] marks each keypress. |
| `--script-file <file>` | Read the script from a file. |
| `--sources <sources>` | Sources it draws on beyond those its steps light (comma-separated). |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft story scene set pop.loopweft S1 --notes 'Start with the whole map.'
Changed scene S1: notes.
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Changed scene S1: notes.",
  "result": {
    "id": "S1",
    "changed": [
      "notes"
    ]
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

### `story scene rm`

Remove a scene; one with steps needs --cascade.

```text
loopweft story scene rm <file> <scene> [options]
```

| Option | Means |
|---|---|
| `--cascade` | Also remove its steps. |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft story scene rm pop.loopweft S1 --cascade
Removed scene S1 ("Growth") and its 2 steps.
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Removed scene S1 (\"Growth\") and its 2 steps.",
  "result": {
    "id": "S1",
    "steps": [
      "S1.1",
      "S1.2"
    ]
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

### `story scene move`

Move a scene.

```text
loopweft story scene move <file> <scene> [options]
```

| Option | Means |
|---|---|
| `--before <scene>` | Put it before this scene (its id or title). |
| `--after <scene>` | Put it after this scene. |
| `--first` | Make it the first scene. |
| `--last` | Make it the last scene. |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft story scene move pop.loopweft Growth --last
Scene S1 is already there.
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Scene S1 is already there.",
  "result": {
    "id": "S1",
    "index": 0
  },
  "changed": false,
  "saved": false
}
```

### `story step add`

Add a step: without map options it shows the whole map, plainly.

```text
loopweft story step add <file> <scene> --label <label> [options]
```

| Option | Means |
|---|---|
| `--label <label>` (required) | A short name for the presenter. |
| `--id <id>` | Its id (default: the next whole number in the scene). |
| `--at <seconds>` | Seconds into the scene when it should arrive. |
| `--cue <text>` | What happens on it, for the presenter. |
| `--before <step>` | Put it before this step (S1.2, or its id or label in that scene). |
| `--after <step>` | Put it after this step. |
| `--first` | Make it the first step. |
| `--last` | Make it the last step. |
| `--map <json>` | Replace the whole map state with this JSON object (applied first). |
| `--map-file <file>` | Read that JSON from a file. |
| `--ripple <variable=up\|down>` | Show what if it rises or falls: it and what the change reaches lit, the rest faded, ▲/▼/± marks and pulses hop by hop (applied after --map; a new step also shows the scene’s caption if its other steps do). |
| `--ripple-optional` | Let --ripple follow links of optional types too. |
| `--hide-map` | Hide the whole map. |
| `--show-map` | Show the map again. |
| `--opacity <n>` | The map’s opacity, 0 to 1. |
| `--base <level>` | The level of variables not listed: hidden, ghost, dim, normal, focus, active. |
| `--link-base <level>` | The level of links not listed. |
| `--hidden <ids>` | Variables or links to hide (comma-separated ids; variables also by label). |
| `--ghost <ids>` | Variables or links to show as ghosts. |
| `--dim <ids>` | Variables or links to dim. |
| `--normal <ids>` | Variables or links at normal strength. |
| `--focus <ids>` | Variables or links to light (focus). |
| `--active <ids>` | Variables or links to light most (active). |
| `--unlist <ids>` | Put variables or links back to the base level. |
| `--up <variables>` | Mark ▲ rising. |
| `--down <variables>` | Mark ▼ falling. |
| `--mixed <variables>` | Mark ± where opposing influences meet. |
| `--clear-trend <variables>` | Take their trends away. |
| `--spread <variable=up\|down>` | Mark a rise or fall and spread it by sign along the lit links (Focus or Active); on a step that lights none, along the whole map, lighting what it reaches. |
| `--badge <loops>` | Show these loops’ R/B badges. |
| `--name <loops>` | Show these loops’ names (and badges). |
| `--hide-name <loops>` | Hide these loops’ names. |
| `--hide-badge <loops>` | Hide these loops’ badges and names. |
| `--clear-pulses` | Take every pulse away (applied before new ones). |
| `--pulse-loop <loop>` | Send the pulse round a named loop, one link after another. |
| `--pulse <links>` | Add a pulse hop: these links pulse together (repeatable, in order). |
| `--pulse-with <links>` | Add these links to the last hop. |
| `--pulse-repeat <n>` | Extra passes of the pulses. |
| `--pulse-tone <tone>` | Harm, relief or mixed for every pulse (default: by the trends). |
| `--pulse-delay <seconds>` | Seconds before the first pulse. |
| `--frame <variables>` | Frame these variables (comma-separated). |
| `--whole-map` | Frame the whole map (or the home view). |
| `--frame-at <where>` | Where they go on the stage: full, center, left, right, lower, inset. |
| `--max-zoom <n>` | A zoom limit, so a small group does not fill the screen. |
| `--labels <which>` | Which labels show: none, focus, view or all. |
| `--category-labels <on\|off>` | Show the group labels. |
| `--label-text <id=text>` | Label text for this step only; empty text clears it (repeatable). |
| `--clear-reveal` | Take the reveal settings away. |
| `--reveal <mode>` | How new things arrive: draw (trace in) or bloom (ring by ring). |
| `--reveal-from <variables>` | The variables the reveal grows from. |
| `--reveal-sequence <ids>` | An exact order: variables appear, links trace. |
| `--reveal-stagger <seconds>` | Seconds between beats. |
| `--reveal-delay <seconds>` | Seconds before the first beat. |
| `--clear-ambient` | Take the ambient pulses away. |
| `--ambient <variables>` | Ambient pulses wander from these variables while the step is held. |
| `--ambient-tone <tone>` | Harm or relief. |
| `--ambient-every <min,max>` | Seconds between walks. |
| `--ambient-hops <min,max>` | Links per walk. |
| `--ambient-delay <seconds>` | Seconds before the first walk. |
| `--clusters <how>` | Group halos: show, dim or hide. |
| `--minimap <on\|off\|auto>` | The minimap (auto: shown when zoomed in). |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft story step add pop.loopweft S1 --label 'Deaths push back' --base dim --active L3,L4 --up Deaths --pulse L3 --pulse L4
Added step S1.3 ("Deaths push back"), step 3 of 3 in scene S1.
Step S1.3: variables not listed are dim.
Step S1.3: L3 and L4 at active.
Step S1.3: deaths marked up.
Step S1.3: pulse along L3 (hop 1).
Step S1.3: pulse along L4 (hop 2).
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Added step S1.3 (\"Deaths push back\"), step 3 of 3 in scene S1. Step S1.3: variables not listed are dim. Step S1.3: L3 and L4 at active. Step S1.3: deaths marked up. Step S1.3: pulse along L3 (hop 1). Step S1.3: pulse along L4 (hop 2).",
  "result": [
    {
      "key": "S1.3",
      "id": "3",
      "index": 2
    },
    {
      "key": "S1.3",
      "changed": [
        "variables"
      ]
    },
    {
      "key": "S1.3",
      "changed": [
        "links"
      ]
    }
    // … 3 more
  ],
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

```console
$ loopweft story step add pop.loopweft S1 --label 'If births rise' --ripple Births=up
Added step S1.3 ("If births rise"), step 3 of 3 in scene S1.
Step S1.3: the ripple of births ▲: 2 variables lit and marked (2 ▲), pulses along 2 links in 2 hops, the rest faded. It shows the scene's caption.
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Added step S1.3 (\"If births rise\"), step 3 of 3 in scene S1. Step S1.3: the ripple of births ▲: 2 variables lit and marked (2 ▲), pulses along 2 links in 2 hops, the rest faded. It shows the scene's caption.",
  "result": [
    {
      "key": "S1.3",
      "id": "3",
      "index": 2
    },
    {
      "key": "S1.3",
      "reached": [
        "population",
        "deaths"
      ],
      "links": [
        "L1",
        "L3"
      ],
      "hops": 2
    }
  ],
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

### `story step set`

Change a step (S05.3): its label, timing and cue, and what its map shows.

```text
loopweft story step set <file> <step> [options]
```

| Option | Means |
|---|---|
| `--label <label>` | A short name for the presenter. |
| `--at <seconds>` | Seconds into the scene when it should arrive. |
| `--cue <text>` | What happens on it, for the presenter. |
| `--clear <fields...>` | Clear these: at, cue. |
| `--map <json>` | Replace the whole map state with this JSON object (applied first). |
| `--map-file <file>` | Read that JSON from a file. |
| `--ripple <variable=up\|down>` | Show what if it rises or falls: it and what the change reaches lit, the rest faded, ▲/▼/± marks and pulses hop by hop (applied after --map; a new step also shows the scene’s caption if its other steps do). |
| `--ripple-optional` | Let --ripple follow links of optional types too. |
| `--hide-map` | Hide the whole map. |
| `--show-map` | Show the map again. |
| `--opacity <n>` | The map’s opacity, 0 to 1. |
| `--base <level>` | The level of variables not listed: hidden, ghost, dim, normal, focus, active. |
| `--link-base <level>` | The level of links not listed. |
| `--hidden <ids>` | Variables or links to hide (comma-separated ids; variables also by label). |
| `--ghost <ids>` | Variables or links to show as ghosts. |
| `--dim <ids>` | Variables or links to dim. |
| `--normal <ids>` | Variables or links at normal strength. |
| `--focus <ids>` | Variables or links to light (focus). |
| `--active <ids>` | Variables or links to light most (active). |
| `--unlist <ids>` | Put variables or links back to the base level. |
| `--up <variables>` | Mark ▲ rising. |
| `--down <variables>` | Mark ▼ falling. |
| `--mixed <variables>` | Mark ± where opposing influences meet. |
| `--clear-trend <variables>` | Take their trends away. |
| `--spread <variable=up\|down>` | Mark a rise or fall and spread it by sign along the lit links (Focus or Active); on a step that lights none, along the whole map, lighting what it reaches. |
| `--badge <loops>` | Show these loops’ R/B badges. |
| `--name <loops>` | Show these loops’ names (and badges). |
| `--hide-name <loops>` | Hide these loops’ names. |
| `--hide-badge <loops>` | Hide these loops’ badges and names. |
| `--clear-pulses` | Take every pulse away (applied before new ones). |
| `--pulse-loop <loop>` | Send the pulse round a named loop, one link after another. |
| `--pulse <links>` | Add a pulse hop: these links pulse together (repeatable, in order). |
| `--pulse-with <links>` | Add these links to the last hop. |
| `--pulse-repeat <n>` | Extra passes of the pulses. |
| `--pulse-tone <tone>` | Harm, relief or mixed for every pulse (default: by the trends). |
| `--pulse-delay <seconds>` | Seconds before the first pulse. |
| `--frame <variables>` | Frame these variables (comma-separated). |
| `--whole-map` | Frame the whole map (or the home view). |
| `--frame-at <where>` | Where they go on the stage: full, center, left, right, lower, inset. |
| `--max-zoom <n>` | A zoom limit, so a small group does not fill the screen. |
| `--labels <which>` | Which labels show: none, focus, view or all. |
| `--category-labels <on\|off>` | Show the group labels. |
| `--label-text <id=text>` | Label text for this step only; empty text clears it (repeatable). |
| `--clear-reveal` | Take the reveal settings away. |
| `--reveal <mode>` | How new things arrive: draw (trace in) or bloom (ring by ring). |
| `--reveal-from <variables>` | The variables the reveal grows from. |
| `--reveal-sequence <ids>` | An exact order: variables appear, links trace. |
| `--reveal-stagger <seconds>` | Seconds between beats. |
| `--reveal-delay <seconds>` | Seconds before the first beat. |
| `--clear-ambient` | Take the ambient pulses away. |
| `--ambient <variables>` | Ambient pulses wander from these variables while the step is held. |
| `--ambient-tone <tone>` | Harm or relief. |
| `--ambient-every <min,max>` | Seconds between walks. |
| `--ambient-hops <min,max>` | Links per walk. |
| `--ambient-delay <seconds>` | Seconds before the first walk. |
| `--clusters <how>` | Group halos: show, dim or hide. |
| `--minimap <on\|off\|auto>` | The minimap (auto: shown when zoomed in). |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft story step set pop.loopweft S1.2 --cue 'Wait for the pulse.'
Changed step S1.2: cue.
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Changed step S1.2: cue.",
  "result": {
    "key": "S1.2",
    "changed": [
      "cue"
    ]
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

```console
$ loopweft story step set pop.loopweft S1.2 --ripple Deaths=down
Step S1.2: the ripple of deaths ▼: 2 variables lit and marked (2 ▲), pulses along 2 links in 2 hops, the rest faded.
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Step S1.2: the ripple of deaths ▼: 2 variables lit and marked (2 ▲), pulses along 2 links in 2 hops, the rest faded.",
  "result": [
    null,
    {
      "key": "S1.2",
      "reached": [
        "population",
        "births"
      ],
      "links": [
        "L4",
        "L2"
      ],
      "hops": 2
    }
  ],
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

### `story step rm`

Remove a step.

```text
loopweft story step rm <file> <step> [options]
```

| Option | Means |
|---|---|
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft story step rm pop.loopweft S1.1
Removed step S1.1 ("The map").
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Removed step S1.1 (\"The map\").",
  "result": {
    "key": "S1.1"
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

### `story step move`

Move a step within its scene, or to another (--scene).

```text
loopweft story step move <file> <step> [options]
```

| Option | Means |
|---|---|
| `--scene <scene>` | Move it to this scene. |
| `--before <step>` | Put it before this step (S1.2, or its id or label in that scene). |
| `--after <step>` | Put it after this step. |
| `--first` | Make it the first step. |
| `--last` | Make it the last step. |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft story step move pop.loopweft S1.2 --first
Moved step S1.2 to place 1 of 2.
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Moved step S1.2 to place 1 of 2.",
  "result": {
    "from": "S1.2",
    "key": "S1.2",
    "index": 0
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

### `story step copy`

Copy a step with everything it shows (just after it, unless placed).

```text
loopweft story step copy <file> <step> --label <label> [options]
```

| Option | Means |
|---|---|
| `--label <label>` (required) | The copy’s label. |
| `--scene <scene>` | Put the copy in this scene. |
| `--before <step>` | Put it before this step (S1.2, or its id or label in that scene). |
| `--after <step>` | Put it after this step. |
| `--first` | Make it the first step. |
| `--last` | Make it the last step. |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft story step copy pop.loopweft S1.2 --label 'The loop again'
Copied step S1.2 as S1.3 ("The loop again").
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Copied step S1.2 as S1.3 (\"The loop again\").",
  "result": {
    "from": "S1.2",
    "key": "S1.3",
    "id": "3",
    "index": 2
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

### `story overlay add`

Add an overlay: caption, title, statement, cards, legend, image.

```text
loopweft story overlay add <file> <step> <type> [options]
```

| Option | Means |
|---|---|
| `--index <n>` | Its place in the list (default: last, on top). |
| `--overlay <json>` | The overlay’s fields as a JSON object (options below win). |
| `--title <text>` | Title: the title; cards: the heading. |
| `--subtitle <text>` | Title: the subtitle. |
| `--line <text>` | Title, statement: a line (repeatable). |
| `--kicker <text>` | Statement: a small line above, e.g. "INTERVENTION A". |
| `--style <style>` | Statement: hero, question, closing, title or note. |
| `--place <place>` | Where on the stage: top-left, top, top-right, left, center, right, bottom-left, bottom, bottom-right. |
| `--card <"title \| sub \| icon">` | Cards: a card; sub and icon may be left out (repeatable). |
| `--active <n,...>` | Cards: the highlighted cards, counted from 0. |
| `--image <id>` | Image: the embedded image (see story image add). |
| `--alt <text>` | Image: what it shows, for people who cannot see it. |
| `--caption <text>` | Image: a caption. |
| `--credit <text>` | Image: its credit. |
| `--cite <source[:pages]>` | A citation (repeatable). |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft story overlay add pop.loopweft S1.2 cards --card 'Births | more people' --card 'Deaths | fewer people' --place right
Step S1.2: added a cards (overlay 2).
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Step S1.2: added a cards (overlay 2).",
  "result": {
    "key": "S1.2",
    "index": 2,
    "type": "cards"
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

### `story overlay set`

Change an overlay (its type stays).

```text
loopweft story overlay set <file> <step> <n> [options]
```

| Option | Means |
|---|---|
| `--clear <fields...>` | Clear these: subtitle, lines, kicker, style, place, title, active, caption, credit, citations. |
| `--overlay <json>` | The overlay’s fields as a JSON object (options below win). |
| `--title <text>` | Title: the title; cards: the heading. |
| `--subtitle <text>` | Title: the subtitle. |
| `--line <text>` | Title, statement: a line (repeatable). |
| `--kicker <text>` | Statement: a small line above, e.g. "INTERVENTION A". |
| `--style <style>` | Statement: hero, question, closing, title or note. |
| `--place <place>` | Where on the stage: top-left, top, top-right, left, center, right, bottom-left, bottom, bottom-right. |
| `--card <"title \| sub \| icon">` | Cards: a card; sub and icon may be left out (repeatable). |
| `--active <n,...>` | Cards: the highlighted cards, counted from 0. |
| `--image <id>` | Image: the embedded image (see story image add). |
| `--alt <text>` | Image: what it shows, for people who cannot see it. |
| `--caption <text>` | Image: a caption. |
| `--credit <text>` | Image: its credit. |
| `--cite <source[:pages]>` | A citation (repeatable). |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft story overlay set pop.loopweft S1.2 1 --place top
Step S1.2: changed the statement (overlay 1): place.
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Step S1.2: changed the statement (overlay 1): place.",
  "result": {
    "key": "S1.2",
    "index": 1,
    "changed": [
      "place"
    ]
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

### `story overlay rm`

Remove an overlay.

```text
loopweft story overlay rm <file> <step> <n> [options]
```

| Option | Means |
|---|---|
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft story overlay rm pop.loopweft S1.2 1
Step S1.2: removed the statement (overlay 1).
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Step S1.2: removed the statement (overlay 1).",
  "result": {
    "key": "S1.2",
    "index": 1
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

### `story overlay move`

Move an overlay to another place in the list.

```text
loopweft story overlay move <file> <step> <n> --to <n> [options]
```

| Option | Means |
|---|---|
| `--to <n>` (required) | Its new place, counted from 0. |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft story overlay move pop.loopweft S1.2 1 --to 0
Step S1.2: moved the statement from overlay 1 to 0.
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Step S1.2: moved the statement from overlay 1 to 0.",
  "result": {
    "key": "S1.2",
    "index": 0
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

### `story image add`

Embed a PNG, JPEG, GIF, WebP or SVG image (its id comes from the file name).

```text
loopweft story image add <file> <image> [options]
```

| Option | Means |
|---|---|
| `--id <id>` | Its id. |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft story image add pop.loopweft photo.png
Embedded image photo (70 bytes).
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Embedded image photo (70 bytes).",
  "result": {
    "id": "photo"
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```

### `story image set`

Replace an embedded image; every overlay that shows it shows the new one.

```text
loopweft story image set <file> <id> <image> [options]
```

| Option | Means |
|---|---|
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft story image set pop.loopweft chart photo.png
Nothing to change: image chart is already that image.
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Nothing to change: image chart is already that image.",
  "result": {
    "id": "chart",
    "uses": [
      "S1.1"
    ]
  },
  "changed": false,
  "saved": false
}
```

### `story image rm`

Remove an embedded image; one still shown needs --cascade.

```text
loopweft story image rm <file> <id> [options]
```

| Option | Means |
|---|---|
| `--cascade` | Also remove the overlays that show it. |
| `--dry-run` | Show what would change, without saving. |

```console
$ loopweft story image rm pop.loopweft chart
Image chart is shown on 1 step (S1.1). Remove those overlays first, or remove it with cascade to remove them too.
[exit 2]
```

With `--json`:

```jsonc
{
  "ok": false,
  "error": {
    "message": "Image chart is shown on 1 step (S1.1). Remove those overlays first, or remove it with cascade to remove them too.",
    "exitCode": 2
  }
}
```

```console
$ loopweft story image rm pop.loopweft chart --cascade
Removed image chart and its overlays on S1.1.
[exit 0]
```

With `--json`:

```jsonc
{
  "ok": true,
  "summary": "Removed image chart and its overlays on S1.1.",
  "result": {
    "id": "chart",
    "steps": [
      "S1.1"
    ]
  },
  "changed": true,
  "saved": true,
  "backup": "pop.loopweft.bak"
}
```
