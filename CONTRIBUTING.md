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

## Reporting problems

Open an issue with what you did, what you expected and what happened instead. For a `.loopweft` file that
misbehaves, attach the smallest file that shows the problem, if you can share it.
