# Loopweft

A studio for beautiful, animated causal systems maps.

Draw a causal map, cite its evidence, author an animated story step by step, then present it with a
presenter console or share it as one HTML file. Loopweft runs in Chrome or Edge from a link, and later as
Windows and Mac apps. A documented command-line tool lets AI agents build and edit maps for anyone who wants
that; the app itself stays human-first, with no AI built in.

Loopweft is open source under the [MIT licence](LICENSE). It keeps everything in local files: no accounts,
no server, no telemetry.

## Status

**Phase 2: the Map workspace**, awaiting its checkpoint review. [The Studio](https://tashiikid.github.io/loopweft/studio/)
runs in Chrome or Edge:

- draw a map on the canvas, or edit it as a table or in the link shorthand;
- categories, roles, link types and custom fields; themes and palettes, checked for colour-vision
  deficiencies and contrast;
- automatic layouts, the map's feedback loops (found, counted and named) and a what-if ripple;
- a blank map, the eight system archetypes or the polycrisis example to start from, or an import from
  CSV or Excel tables, Kumu or DataViz;
- open and save `.loopweft` files, undo and redo, and a copy kept in the browser in case it closes.

The `loopweft` command line does the same edits ([its commands](packages/cli/README.md)), and the engine
that draws and animates a map's story plays [the example](https://tashiikid.github.io/loopweft/demo/). Sources,
the story editor, the presenter and the exports come in the next phases.

- [The `.loopweft` format, version 1 (draft)](docs/format.md)
- [Importing maps](docs/import.md), [templates](docs/templates.md), and [loops and ripples](docs/analysis.md)
- [The polycrisis example](examples/README.md)

## Roadmap

Each phase ends with a checkpoint that is reviewed before the next one begins.

| # | Phase | Delivers |
|---|---|---|
| 0 | Foundations | Repository, licence checks, CI on Windows, macOS and Linux; the `.loopweft` format, validation, operations, shorthand, loops and integrity checks; the polycrisis example |
| 1 | Engine | The animation engine, the SVG renderer and automatic layouts; the example renders and animates |
| 2 | Map workspace | The editor: canvas, table view, shorthand box, types, themes, palettes, loops, templates, import; CLI basics |
| 3 | Sources | Reference library, DOI lookup, citations with pages and strength, APA list, uncited warnings |
| 4 | Story | Scenes and steps, record view, reveals, pulses, overlays, notes and script, preview, validation |
| 5 | Present + HTML | Presenter console and audience window; one-file HTML export |
| 6 | Exports | PNG, SVG, PDFs, MP4 and GIF |
| 7 | Agent support | `loopweft guide`, the full CLI reference, live reload of edited files |
| 8 | Desktop apps | Windows installer and macOS app |
| 9 | v1.0 | Web app and docs on GitHub Pages, example gallery, release |

## Repository

| Path | What it holds |
|---|---|
| `packages/model` | The `.loopweft` format and everything that needs no screen |
| `docs/` | The format specification, how imports work, the templates, and what loops and ripples mean |
| `examples/` | Example projects: the polycrisis map and story |
| `packages/motion`, `layout`, `render` | The animation engine, automatic layouts and the SVG renderer |
| `packages/cli` | The `loopweft` command line ([its commands](packages/cli/README.md)) |
| `apps/studio` | The Studio, where maps are drawn and edited ([try it](https://tashiikid.github.io/loopweft/studio/)) |
| `apps/viewer` | The viewer that plays a project's story ([the example](https://tashiikid.github.io/loopweft/demo/)) |
| `packages/player` | A placeholder for Phase 5 |
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
