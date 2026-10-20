# Loopweft

A studio for beautiful, animated causal systems maps.

Draw a causal map, cite its evidence, author an animated story step by step, then present it with a
presenter console or share it as one HTML file. Loopweft runs in Chrome or Edge from a link, and later as
Windows and Mac apps. A documented command-line tool lets AI agents build and edit maps for anyone who wants
that; the app itself stays human-first, with no AI built in.

Loopweft is open source under the [MIT licence](LICENSE). It keeps everything in local files: no accounts,
no server, no telemetry.

## Status

**Phase 4: Story**, at its checkpoint; Phase 5 (Present and HTML) starts after its review.
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
- a blank map, the eight system archetypes or the polycrisis example to start from, or an import from
  CSV or Excel tables, Kumu or DataViz;
- open and save `.loopweft` files, undo and redo, and a copy kept in the browser in case it closes.

The `loopweft` command line does the same edits ([its commands](packages/cli/README.md)), and the engine
that draws and animates a map's story plays [the example](https://tashiikid.github.io/loopweft/demo/). The
presenter and the exports come in the next phases.

- [The `.loopweft` format, version 1 (draft)](docs/format.md)
- [Importing maps](docs/import.md), [templates](docs/templates.md), [loops, ripples and paths](docs/analysis.md),
  [sources and citations](docs/sources.md), and [telling a story](docs/story.md)
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
| 7 | Agent support | `loopweft guide`, the full CLI reference, live reload of edited files |
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
| `docs/` | The format specification, how imports work, the templates, what loops, ripples and paths mean, how sources and citations work, and how a story is told and checked |
| `examples/` | Example projects: the polycrisis map and story |
| `packages/motion`, `layout`, `render` | The animation engine, automatic layouts and the SVG renderer |
| `packages/cli` | The `loopweft` command line ([its commands](packages/cli/README.md)) |
| `apps/studio` | The Studio, where maps are drawn and edited ([try it](https://tashiikid.github.io/loopweft/studio/)) |
| `apps/viewer` | The viewer that plays a project's story ([the example](https://tashiikid.github.io/loopweft/demo/)) |
| `packages/player` | The presentation runtime (Phase 5, being built): the deck, show state, keys, clock and pace, and the link between a presentation's windows |
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
