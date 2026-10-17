# Contributing to Loopweft

Thank you for helping. Loopweft is built in small, reviewed slices; this page explains how.

## Setting up

1. Install Node 24 (the version in `.nvmrc`).
2. Clone the repository and run `npm install`. This also points git at the versioned hooks in `.githooks/`,
   so `git push` first runs the fast checks.
3. Run `npm run verify`. It should pass before you change anything.

## Making a change

- Work on a branch named `slice/<phase>-<slug>` and open one pull request per slice.
- Keep each slice vertical and shippable: code, tests and docs together, nothing half-wired.
- Run `npm run verify` before you push and paste its summary into the pull request. GitHub Actions runs the
  same gate on Windows, macOS and Linux.
- Follow [AGENTS.md](AGENTS.md): deterministic outputs, never invent data, permissive dependencies with
  exact pins, erasable TypeScript syntax and `.ts` import specifiers.

## Adding a dependency

Every dependency, development tools included, must use one of the licences listed in
[AGENTS.md](AGENTS.md#principles-non-negotiable), and every version must be pinned exactly to a release at
least two weeks old:

```bash
npm install --save-exact --before=2026-10-03 some-package@1.2.3
```

Use the date two weeks before today, then read the `package-lock.json` diff: new transitive packages are
pinned to the same cut-off. `npm test` fails if any locked package has a licence outside the list.

## Code from other projects

Code copied from DataViz or from the polycrisis deck starts with a `Source:` comment naming the original
file and commit. Copy engine code only, never private notes, research data or credentials.

## The polycrisis example

`examples/polycrisis.loopweft` is generated from a private presentation by
`npm run convert:polycrisis -- --deck <folder>`. The tests check the committed file everywhere; where the
presentation is available they also rebuild it and compare byte for byte. To point the tests at it, set
`LOOPWEFT_POLYCRISIS_DECK`, or create `.local.json` (git-ignored) at the repository root:

```json
{ "polycrisisDeck": "C:/path/to/PolycrisisPresentation", "privateWords": ["a name", "a course code"] }
```

Elsewhere (and on CI) those two tests are skipped.

`privateWords` lists words that must never appear in the example, such as the presenter's name. They live
only in `.local.json` (or `LOOPWEFT_PRIVATE_WORDS`, comma-separated) so the repository never contains them;
the converter refuses to write an example that contains one, and a test checks the committed example.
Another test ([`test/repo.test.ts`](test/repo.test.ts)) looks for them in every file of the repository: as
staged for the next commit, as on disk, and in untracked files that git does not ignore.

### Comparing renders with the presentation

`npm run review:capture` takes a still of every step of the example, played by the viewer, and, where the
presentation is available, of every build of the presentation from its own built `dist/` folder (served
read-only; nothing is written into it). `npm run review:diff` measures where each pair differs (a share of
the picture, and an image: teal where only Loopweft draws, magenta where only the presentation does).
`npm run review:sheets` then lays each pair side by side: contact sheets as PNGs, and an `index.html` with
every pair and its difference at full width, in `review/phase1/`. All three take `--out <folder>`; the
capture also takes `--only S04.2a,S05.2` and `--no-deck`. The stills include the presentation's own title
page, so `review/` is git-ignored: keep them out of the repository.

## Viewing the example

`npm run viewer` serves the viewer (`apps/viewer`) on this machine. It plays the example story; drop any
`.loopweft` file on the page to play that instead. The published copy is at
<https://tashiikid.github.io/loopweft/demo/>.

## Reporting problems

Open an issue with what you did, what you expected and what happened instead. For a `.loopweft` file that
misbehaves, attach the smallest file that shows the problem, if you can share it.
