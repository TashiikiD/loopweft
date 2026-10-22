# AGENTS.md

Guidance for AI agents (and humans) working in this repository.

## What this is

Loopweft is an open-source (MIT) studio for beautiful, animated causal systems maps. People draw a causal
map, cite its evidence, author an animated story step by step, present it and share it as one HTML file.
It grew out of a cinematic polycrisis presentation; [`examples/polycrisis.loopweft`](examples/polycrisis.loopweft)
is that map and story, converted and cleaned up.

The work is phased (see [README.md](README.md#roadmap)); each phase ends with a checkpoint the project owner
reviews before the next one starts. The file format is specified in [docs/format.md](docs/format.md).

## Principles (non-negotiable)

- **Never invent data.** Loopweft shows exactly what a project contains. No placeholder variables, links,
  citations, counts or page numbers; no silent defaults that change meaning. Missing required values are
  validation errors. An unknown link sign is written `?` and flagged, never guessed.
- **Deterministic outputs.** The same input gives the same bytes: files, layouts and exports. Anything random
  is seeded. No `Math.random`, `Date.now()`, `new Date()` or `performance.now()` in anything that affects an
  output; a caller that needs the time (e.g. to stamp `meta.modified`) passes it in. Timings may go to logs.
- **Evidence stays traceable.** Citations keep their source and pages; a conversion or import that cannot
  carry something across says so instead of approximating it.
- **No telemetry, no accounts, no server.** The only network call is the optional DOI lookup.
- **Nothing personal in the repository.** It is public: no real names, course details, local paths or
  personal email addresses in files or commits (commit with the GitHub noreply address). Words that must
  never appear in the example go in the git-ignored `.local.json` (`privateWords`), never in code.
- **Permissive dependencies only**, development tools included: MIT, MIT-0, Apache-2.0, BSD-2-Clause,
  BSD-3-Clause, ISC, 0BSD, BlueOak-1.0.0, Zlib, CC0-1.0; OFL-1.1 for fonts only. No MPL, LGPL or GPL. That is
  why Vite stays on 7: Vite 8 requires Lightning CSS (MPL-2.0). [`test/repo.test.ts`](test/repo.test.ts)
  checks every locked package.
- **Exact pins, at least two weeks old**, transitive ones included. Add dependencies with
  `npm install --save-exact --before=<date two weeks ago> <package>@<version>` (e.g. `--before=2026-10-03`
  on 2026-10-17) and read the lockfile diff before committing it.
- **Copied code says where it came from.** Code taken from DataViz (`TashiikiD/DataViz`, private, commit
  `efcdbe2`) or from the polycrisis deck (`PolycrisisPresentation`, private) starts with a `Source:` comment
  naming the original path and commit. Copy engine code only: no private notes, research data or credentials.

## TypeScript

- Strict, with `noUncheckedIndexedAccess`. Packages export their TypeScript source; there is no build step
  between internal packages.
- **Erasable syntax only** (`erasableSyntaxOnly`): no enums, namespaces or constructor parameter properties,
  so Node runs the files directly (`node packages/model/scripts/export-schema.ts`).
- Relative imports name the `.ts` file: `import { parseProject } from './validate.ts'`.
- Type-only imports use `import type` (`verbatimModuleSyntax`).

## Workflow

- Each phase is split into slices; each slice is one pull request on its own branch
  (`slice/<phase>-<slug>`), with the `npm run verify` summary in its description.
- `npm run verify` is the merge gate: typecheck, lint, unit tests and the Studio's end-to-end tests (in the
  computer's own Chrome or Edge). GitHub Actions runs it on Windows, macOS and Linux for every push and pull
  request. The pre-push hook runs `npm run verify:fast` (no end-to-end tests).
- Keep slices vertical and shippable; don't leave half-wired code on `main`.
- A change to the `.loopweft` format updates the zod schema (`packages/model/src/schema.ts`), the JSON
  Schema (`npm run schema`) and the specification ([docs/format.md](docs/format.md)); once version 1 is
  released, it also needs a migration (`packages/model/src/migrate.ts`).

## Commands

| Command | What it does |
|---|---|
| `npm install` | Installs all workspace dependencies and the git hooks |
| `npm run typecheck` | `tsc --noEmit` over all packages |
| `npm run lint` | Biome lint and format check (`npm run format` fixes) |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright end-to-end tests of the Studio in this computer's Chrome or Edge (`LOOPWEFT_CHROME` names another; `LOOPWEFT_REVIEW=<folder>` also saves screens there) |
| `npm run verify` | The full merge gate, with a Markdown summary |
| `npm run schema` | Regenerates `packages/model/schema/loopweft.v1.schema.json` after a format change |
| `npm run cli-docs` | Regenerates `docs/cli.md`, the command line's full reference, after a command or its output changes |
| `npm run studio` | Serves the Studio on this machine (`?example` opens the polycrisis example) |
| `npm run player` | Serves the presentation player on this machine with the polycrisis example |
| `npm run loopweft -- <command>` | Runs the `loopweft` command line (`npx loopweft` works too) |
| `npm run convert:polycrisis -- --deck <folder>` | Rebuilds `examples/polycrisis.loopweft` from the private polycrisis deck |
| `npm run site` | Builds the GitHub Pages site into `_site/` (`.github/workflows/pages.yml` publishes it) |

Generated files (`packages/model/schema/*.schema.json`, `examples/polycrisis.loopweft`, `docs/cli.md`) are not
edited by hand; tests check that they are current. The polycrisis deck is private, so the test that rebuilds the
example runs only where the deck is (see CONTRIBUTING.md) and is skipped on CI.

## Layout

Packages live in `packages/*` as npm workspaces named `@loopweft/<name>`; tests sit in `packages/<name>/test`.

| Package | Role |
|---|---|
| `model` | The `.loopweft` format (zod schema, JSON Schema, validation, migrations, canonical serialization), `ops`, the shorthand, loops, integrity checks, references and the DOI lookup (its only network call), the importers (tables, Kumu, DataViz; see docs/import.md) and the polycrisis converter |
| `motion` | The animation engine: timelines, eases, and a clock that steps exact frames |
| `layout` | Automatic layouts (constellation, force, flow), link curves, label placement, camera maths, and `applyAutoLayout` (the edit both front ends use to lay a map out) |
| `render` | The drawable graph, themes, palettes and colour-vision checks, and the SVG map view and story view |
| `player` | The presentation runtime, in plain DOM: the audience window, the presenter console, rehearsal notes, the start page, the link that keeps a presentation's windows in step, and the one-file HTML (`exportHtml`; `build/template.ts` builds the page it goes into) |
| `export` | Every export but the one-file HTML: the export page (built into one HTML file, like the player's), which draws the stage frame by frame in a browser, the same in the Studio's hidden frame and in the headless Chrome or Edge the command line drives (`node/`, its own DevTools client over a pipe); pictures (PNG) and drawings (SVG, `src/svg/`: the laid-out stage read back as true SVG), the speaker notes and references PDFs (`src/pdf/`, pdf-lib, no browser), the slides PDF (each step drawn by the export page), video (`src/video/`: steps played frame by frame, encoded by the browser's WebCodecs, written as MP4 or WebM by its own writers) and GIF (gifenc, only what changed in each frame); see docs/export.md |
| `cli` | The `loopweft` command line (`new`, `info`, `validate`, `add`, `var`, `link`, `type`, `loops`, `ripple`, `paths`, `connected`, `layout`, `import`, `export --html|--png|--svg|--pdf|--mp4|--webm|--gif`, the evidence: `source`, `cite`, `references`, and the story: `story`); see its README |

Apps live in `apps/*`: `studio` is the editor, in React and Mantine (published at `/studio/`, with its
audience window at `/studio/audience.html`; its tests run in jsdom, in the `studio` Vitest project, and its
end-to-end tests in `apps/studio/e2e`, with Playwright). The site's `/demo/` is the polycrisis example
exported as one HTML file (`packages/player`). `tools/safari.ts` opens that file in Safari on CI's Mac.

Every edit to a project is an operation in `@loopweft/model` (`src/ops/`): a project goes in, and
`{ project, result, summary }` comes out, with the input untouched; an expected failure is an `OpError`
(`invalid`, `usage`, `notFound` or `conflict`). The Studio and the CLI call the same operations; add new
edits there, never to one front end only.

