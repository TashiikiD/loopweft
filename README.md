# Loopweft

A studio for beautiful, animated causal systems maps.

Draw a causal map, cite its evidence, author an animated story step by step, then present it with a
presenter console or share it as one HTML file. Loopweft runs in Chrome or Edge from a link, and later as
Windows and Mac apps. A documented command-line tool lets AI agents build and edit maps for anyone who wants
that; the app itself stays human-first, with no AI built in.

Loopweft is open source under the [MIT licence](LICENSE). It keeps everything in local files: no accounts,
no server, no telemetry.

## Status

**Phase 7: Agent support**, at its checkpoint; Phase 8 (the desktop apps) starts after its review.
[The Studio](https://tashiikid.github.io/loopweft/studio/) runs in Chrome or Edge:

- draw a map on the canvas, or edit it as a table or in the link shorthand;
- categories, roles, link types and custom fields; themes, and palettes (presets or the map's own),
  checked for colour-vision deficiencies and contrast;
- automatic layouts, the map's feedback loops (found, counted and named), a what-if ripple, the paths
  between two variables, and the most-connected variables (with the caveat that connected does not mean
  leverage);
- a references library: add a source by its DOI (looked up at Crossref or DataCite, Loopweft's only network call) or by
  hand; cite it on variables, links and loops with pages and a strength; see what cites nothing; and the
  APA reference list made from the sources;
- a story: scenes of steps, each set up by clicking on the stage (what is lit, ▲/▼ trends spread by sign,
  loop badges, pulses, the camera), with overlays (title pages, statements, cards, images, the legend), speaker
  notes and a script with key marks, a preview of the transitions, and checks that flag mistakes such as a
  pulse on a hidden link or a trend the signs contradict;
- presenting: a presenter console (notes, script with key marks, clocks and pace, the evidence for what is
  on screen) and an audience window for the projector that follows it, a rehearsal in one window, and a
  mode that names each variable's category in words (C);
- one HTML file to share or present from: it opens by double-click, offline, with a start page listing
  every source;
- exports made on this computer: pictures (PNG) and editable drawings (SVG) of a step, of every step or of
  the whole map; the slides, the speaker notes and the references as PDFs; the story as video (MP4 or
  WebM), played frame by frame as the talk plays it; and GIF loops of a scene or some steps;
- a blank map, the eight system archetypes or the polycrisis example to start from, or an import from
  CSV or Excel tables, Kumu or DataViz;
- open and save `.loopweft` files, undo and redo, and a copy kept in the browser in case it closes;
- working with an AI agent: File › Work with an AI agent… gives a message to paste into an agent that runs
  commands on your computer (Claude Code, Codex), and the open map follows each change it saves.

The `loopweft` command line does the same edits and makes the same exports ([its commands](packages/cli/README.md),
[all of them, with examples](docs/cli.md)). `loopweft guide` prints [the guide for AI agents](docs/agents/SKILL.md):
how to build, check and export a map with it, and the rules to keep (never guess a sign, never invent evidence,
check before exporting, report what it did). See [Loopweft and AI agents](https://tashiikid.github.io/loopweft/agents/).
[The example story](https://tashiikid.github.io/loopweft/demo/) is the polycrisis map exported as one HTML
file.

- [The `.loopweft` format, version 1 (draft)](docs/format.md)
- [Importing maps](docs/import.md), [templates](docs/templates.md), [loops, ripples and paths](docs/analysis.md),
  [sources and citations](docs/sources.md), [telling a story](docs/story.md),
  [presenting and sharing it](docs/present.md), and [exporting](docs/export.md)
- [The polycrisis example](examples/README.md)

## Roadmap

Each phase ends with a checkpoint that is reviewed before the next one begins.

| # | Phase | Delivers |
|---|---|---|
| 0 | Foundations | Repository, licence checks, CI on Windows, macOS and Linux; the `.loopweft` format, validation, operations, shorthand, loops and integrity checks; the polycrisis example |
| 1 | Engine | The animation engine, the SVG renderer and automatic layouts; the example renders and animates |
| 2 | Map workspace | The editor: canvas, table view, shorthand box, types, themes, palettes, loops, templates, import; CLI basics |
| 3 | Sources | Reference library, DOI lookup, citations with pages and strength, APA list, uncited warnings; a path finder between two variables and the most-connected variables |
| 4 | Story | Scenes and steps, record view, reveals, pulses, overlays, notes and script, preview, validation |
| 5 | Present + HTML | Presenter console and audience window; one-file HTML export; a viewing mode that names each variable's category in words, for viewers who cannot tell the colours apart |
| 6 | Exports | PNG, SVG, PDFs, MP4 and GIF |
| 7 | Agent support | `loopweft guide`, the full CLI reference, live reload of edited files, "Copy agent instructions" in the Studio |
| 8 | Desktop apps | Windows installer and macOS app |
| 9 | v1.0 | Web app and docs on GitHub Pages, example gallery, release |

Planned for v2.0, after v1.0: a DataViz project's citations become Loopweft sources, but only where a full
reference is given by the user or looked up and confirmed (by its DOI, for instance); DataViz itself holds
only the citation and its locator. Until then, and wherever no full reference is found, they come across as
text, in the custom field "DataViz sources".

## Repository

| Path | What it holds |
|---|---|
| `packages/model` | The `.loopweft` format and everything that needs no screen |
| `docs/` | The format specification, how imports work, the templates, what loops, ripples and paths mean, how sources and citations work, how a story is told and checked, how it is presented and shared, and what each export holds |
| `examples/` | Example projects: the polycrisis map and story |
| `packages/motion`, `layout`, `render` | The animation engine, automatic layouts and the SVG renderer |
| `packages/cli` | The `loopweft` command line ([its commands](packages/cli/README.md)) |
| `apps/studio` | The Studio, where maps are drawn and edited ([try it](https://tashiikid.github.io/loopweft/studio/)) |
| `packages/player` | The presentation runtime: the audience window, the presenter console, rehearsal notes, the start page and the one-file HTML export ([the example](https://tashiikid.github.io/loopweft/demo/), exported) |
| `packages/export` | Every other export: pictures (PNG), drawings (SVG), the PDFs, video (MP4, WebM) and GIF ([what each holds](docs/export.md)) |
| `site/` | The GitHub Pages landing page (`npm run site` builds `_site/`) |
| `test/` | Repository rules, such as the dependency licence check |
| `.github/workflows/` | CI (`npm run verify` on Windows, macOS and Linux) and the Pages deploy |

## Development

Requires Node 24 (see `.nvmrc`).

```bash
npm install
```

```bash
npm run verify
```

`npm run verify` runs the typecheck, Biome and the tests; it is the gate every change must pass. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and [AGENTS.md](AGENTS.md) for the conventions.
