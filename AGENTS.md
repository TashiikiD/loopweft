# AGENTS.md

Guidance for AI agents (and humans) working in this repository.

## What this is

Loopweft is an open-source (MIT) studio for beautiful, animated causal systems maps. People draw a causal
map, cite its evidence, author an animated story step by step, present it and share it as one HTML file.
It grew out of a cinematic polycrisis presentation, whose map and story become its first example.

The work is phased (see [README.md](README.md#roadmap)); each phase ends with a checkpoint the project owner
reviews before the next one starts.

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
- `npm run verify` is the merge gate: typecheck, lint and tests. GitHub Actions runs it on Windows, macOS
  and Linux for every push and pull request. The pre-push hook runs `npm run verify:fast`.
- Keep slices vertical and shippable; don't leave half-wired code on `main`.

## Commands

| Command | What it does |
|---|---|
| `npm install` | Installs all workspace dependencies and the git hooks |
| `npm run typecheck` | `tsc --noEmit` over all packages |
| `npm run lint` | Biome lint and format check (`npm run format` fixes) |
| `npm test` | Vitest unit tests |
| `npm run verify` | The full merge gate, with a Markdown summary |

## Layout

Packages live in `packages/*` as npm workspaces named `@loopweft/<name>`; tests sit in `packages/<name>/test`.

| Package | Role |
|---|---|
| `model` | The `.loopweft` format and everything that needs no screen (Phase 0) |
| `motion`, `layout`, `render` | Phase 1: the animation engine, auto-layouts and the SVG renderer (placeholders for now) |
| `player` | Phase 5: the presentation runtime (placeholder) |
| `cli` | Phase 2: the `loopweft` command-line tool (placeholder) |

