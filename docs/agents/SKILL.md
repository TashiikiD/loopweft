---
name: loopweft
description: Build, check and export Loopweft causal maps (.loopweft files) with the loopweft command line - variables and signed links, feedback loops, sources and citations, a step-by-step story, and exports (one-file HTML presentation, PDFs, pictures, video). Use when asked to make or change a causal loop diagram, a system archetype map or a Loopweft project.
---

# Working on Loopweft maps with the `loopweft` command line

Loopweft is a studio for animated causal maps: variables (things that can rise or fall), links between them
with a sign, the feedback loops they make, the evidence behind each link, and a story told step by step over
the map, presented live or shared as one HTML file. People draw maps in the Loopweft Studio; you work on the
same `.loopweft` files through the `loopweft` command line. The person you work for stays in charge of what the
map claims: you build what the brief and the sources support, you say plainly what you added yourself, and you
never fill a gap with something made up.

This guide is everything you need; `loopweft guide` prints it, and `loopweft guide --install <folder>` puts it
where Claude Code (`.claude/skills/loopweft/SKILL.md`) and Codex (`AGENTS.md`) find it. Every command also
explains itself: `loopweft help <command>` (or `loopweft <command> --help`) lists its options, and the full
reference, with examples of what each command prints, is <https://github.com/TashiikiD/loopweft/blob/main/docs/cli.md>.

## Running it

- **Where Loopweft is installed**, the command is `loopweft`. Check that it runs first: `loopweft --version`.
- **Inside a copy of the Loopweft repository** (after `npm install`), it is `npx loopweft`. It needs Node 24.
  If `loopweft` is not found and you are not in such a copy, ask the person where Loopweft is; do not look for
  it, clone it or install it yourself.

Below, `loopweft` stands for whichever applies. **Run commands one at a time** and read each answer before the
next: a chain (`a; b` or `a && b`) hides which one failed, and with `;` the rest go on after a failure. Put `--json` on any command to get exactly one JSON document on
stdout: `{ "ok": true, … }`, or `{ "ok": false, "error": { "message", "exitCode", "issues" } }`.

| Exit code | Means | What to do |
|---|---|---|
| 0 | Done | Go on |
| 1 | The project is invalid, or your change would make it so; nothing was saved | Read `error.issues`, fix what they name, try again |
| 2 | The command was used wrongly (a missing file, an unknown name, a removal something still needs); nothing was saved | Read the message, fix the command |
| 3 | Internal error | Stop and tell the person; `LOOPWEFT_DEBUG=1` prints a stack trace |

Every edit is checked before it is saved, saved whole (never half-written), and the previous version is kept as
`<file>.bak`. `--dry-run` on an edit shows what would change without saving.

## The rules

These are not suggestions. The person relies on the map being honest about its evidence.

1. **Change maps only through `loopweft` commands.** Never edit a `.loopweft` file's text yourself: the commands
   check every change and keep the file in its exact form. This guide, `loopweft help <command>` and the person's
   own material are all you need: do not search the computer or read Loopweft's own files.
2. **Never guess a link's sign.** A sign says which way the effect goes: `+` the effect moves the same way as the
   cause, `-` the opposite way. Take it from the brief, a source, or the archetype you were asked to use. A link
   you suggest yourself may carry the sign your reasoning gives, with that reasoning in its `rationale`, and it
   is reported as your suggestion. When neither the material nor clear reasoning settles which way, write `?`:
   Loopweft flags it, and the person decides.
3. **Say where every link comes from.** Give each link you add or keep a `Basis` (a custom field; see
   [step 2](#2-start-from-the-archetype)): `brief`, `archetype`, `source` or `suggestion` (your own). A link
   marked `suggestion` is a claim of yours, not of the brief or a source: the person can find every one of them,
   in the Studio's table and inspector, and keep, change or remove it.
4. **Never invent evidence.** Add a source only if the person gave it to you, or you found it and confirmed it
   with `loopweft source lookup <doi>`. A DOI lookup confirms that a work exists, not what it says: cite it on a
   link only where the person's material or the text you were given supports that link. Never write a page
   number you have not seen in text you were given. When unsure, leave the link uncited (Loopweft flags it)
   rather than cite something weak.
5. **Check before you export.** Run `loopweft validate <file>`. Export only when it reports 0 errors and no
   warnings but `uncitedLink` and `unknownSign`: those two are the person's to settle (with sources, or by
   choosing a sign), so list them in your report. Fix every other warning first; none of them is minor.
6. **Report when you finish** (see [the report](#the-report)): what you changed, what is still uncited, every
   `?` sign, each of your own suggestions one by one, and the files you exported.

**The person may be watching.** If they have the map open in the Loopweft Studio in Chrome or Edge, each change
you save appears there within a second or two, with a note of what changed, and they can undo it. If they have
unsaved changes of their own, the Studio asks them which version to keep and merges nothing, so ask them to
save before you start, and tell them when you have finished.

## Building a map from a brief

A worked example. The brief: *"Use the Limits to growth archetype. Our community garden grew quickly because
members invited their friends. Now there is a long wait for a plot, and new people give up before they get one.
Make a short presentation of why growth stalled."*

### 1. Plan before you type

Write down the variables and links first, and for each link where its sign comes from.

- **Variables are things that can rise or fall**, named neutrally so either direction makes sense:
  "Waiting time for a plot", not "Long waits"; "Garden members", not "More members".
- **A link** says that a change in the cause tends to change the effect, all else equal. The sign says nothing
  about how big the effect is, or whether it is good or bad.
- **Delays**: mark a link `delay` when its effect takes notably long.
- **Loops**: Loopweft finds them and works out whether each is reinforcing (R: an even number of `-` links) or
  balancing (B: an odd number). You never set R or B yourself.

### 2. Start from the archetype

There is a template for each of the eight classic system archetypes (Kim and Anderson, 1998), with their
variables, signs, delays and named loops. Its links cite nothing; its named loops cite the book's figure.

| Template | Archetype |
|---|---|
| `fixes-that-fail` | Fixes that fail |
| `shifting-the-burden` | Shifting the burden |
| `limits-to-growth` | Limits to growth |
| `tragedy-of-the-commons` | Tragedy of the commons |
| `escalation` | Escalation |
| `success-to-the-successful` | Success to the successful |
| `eroding-goals` | Eroding goals |
| `growth-and-underinvestment` | Growth and underinvestment |

For a map from scratch, `loopweft new <file> --title "<title>"` makes a blank one. A template's description
describes the archetype; `loopweft meta` replaces it with what this map is (and is not).

```bash
loopweft new garden.loopweft --template limits-to-growth --title 'Why the garden stopped growing'
loopweft meta garden.loopweft --description 'The Limits to growth archetype, applied to a community garden from a short brief. A qualitative sketch: no sources yet.'
loopweft var list garden.loopweft
loopweft link list garden.loopweft
loopweft loops list garden.loopweft
```

Then add the `Basis` field (rule 3), and mark the template's links: they come from the archetype.

```bash
loopweft type field add garden.loopweft --name Basis --kind choice --applies-to links --option brief=Brief --option archetype=Archetype --option source=Source --option 'suggestion=Agent suggestion' --description 'Where the link comes from: the brief, the archetype, a source, or a suggestion of the agent.'
loopweft link set garden.loopweft L1 --field Basis=archetype
loopweft link set garden.loopweft L2 --field Basis=archetype
loopweft link set garden.loopweft L3 --field Basis=archetype
loopweft link set garden.loopweft L4 --field Basis=archetype
loopweft link set garden.loopweft L5 --field Basis=archetype
```

A map that already has a `Basis` field keeps it (`loopweft type field add` refuses a second one). A link the brief
states outright is `brief`, even when the archetype has it too.

### 3. Name the variables for the brief

Rename each template variable (its id stays) and say what exactly rises or falls. **Keep the template's signs
true**: name each variable so that the archetype's sign still holds. The template's "Constraint" increases its
"Limiting action" (`+`); "Shortage of plots" keeps that sign, while "Plots available" would turn it into `-`.

```bash
loopweft var set garden.loopweft efforts --label 'Invitations from members' --definition 'How often members invite friends to join.'
loopweft var set garden.loopweft performance --label 'Garden members' --definition 'People with a plot or on the way to one.'
loopweft var set garden.loopweft limiting_action --label 'Waiting time for a plot' --definition 'How long a new member waits for a plot.'
loopweft var set garden.loopweft constraint --label 'Shortage of plots' --definition 'How far demand for plots exceeds the plots there are.'
loopweft var list garden.loopweft
```

Variables and links are named by id or by label (case and spacing do not matter).

### 4. Add links in shorthand

The shorthand adds many links at once, one per line, with new names becoming new variables. Write it to a file
(it avoids quoting trouble in the shell) and add it with `--shorthand-file`, or pass short text with
`--shorthand` (`\n` between lines).

```text file=more-links.txt
# One link per line: cause -> effect (sign, details)
Garden members -> Shortage of plots (+, Basis=suggestion, rationale="Suggested by the agent: each new member takes up a plot or a place in line.")
```

```bash
loopweft add garden.loopweft --shorthand-file more-links.txt
```

In the brackets: the sign (`+`, `-` or `?`), then any of `delay` (or `delay "2 yrs"`), `conf=low|medium|high`,
`weight=<n>`, `rationale="<why>"`, `conditional=true`, or a custom field `<field>=<value>`. A line without a
sign is recorded as `?` with a warning. `@group <Category>: A, B` puts variables in a category. Nothing is added
if any line has an error; every error is reported with its line and column.

This link is not in the brief: it is a suggestion of the agent's (a fair one: members occupy the plots), so its
`Basis` is `suggestion`, its rationale gives the reasoning, and it goes in the report as such.

One link at a time works too, and a sign is always required:

```bash
loopweft link add garden.loopweft --from 'Waiting time for a plot' --to 'Invitations from members' --sign '?' --field Basis=suggestion --rationale 'Suggested by the agent: members may stop inviting friends who would only wait, or invite them sooner; the brief does not say which.'
loopweft link list garden.loopweft
```

Change a link with `link set` (`--sign`, `--delay`, `--confidence`, `--rationale`, `--field`, …), turn `+` into
`-` with `link flip`, remove it with `link rm`.

**Ids are given for you**: variables take one from their label, links are `L1`, `L2`…, scenes `S1`, `S2`…, and
steps are numbered in their scene, named from outside it as `S1.2`. Give `--id` only to choose one yourself, and
never with a dot.

**Putting a variable into a named loop.** A template's loops are named, and a named loop's links must close into
a chain, so moving one end of a link inside it is refused. `--cascade` makes the change and takes the loop's name
off; then add the missing link and name the loop again, with its links in order round it (`loops list` shows
them) and its old id and name:

```bash
loopweft var add garden.loopweft --label 'Members on the waiting list' --definition 'People who have joined and wait for a plot.'
loopweft link set garden.loopweft L3 --to 'Members on the waiting list' --cascade
loopweft link add garden.loopweft --from 'Members on the waiting list' --to 'Waiting time for a plot' --sign + --field Basis=suggestion --rationale 'Suggested by the agent: the more people in line, the longer each waits.'
loopweft link set garden.loopweft L3 --field Basis=suggestion
loopweft loops list garden.loopweft
loopweft loops add garden.loopweft --links L4,L3,L8 --id B2 --name 'The limiting action slows performance' --archetype 'Limits to growth'
```

### 5. Check the loops

```bash
loopweft loops list garden.loopweft
loopweft loops set garden.loopweft R1 --name 'Members bring in members'
loopweft loops set garden.loopweft B2 --name 'Waiting puts people off'
```

`loops list` shows every loop the map makes, R or B, and which are named. Name the ones the story talks about
with `loops add --links <ids in order> --name "<name>"` (or rename a template's with `loops set`). A loop through
a `?` link has no polarity until the person decides the sign. `ripple <file> <variable> up|down` traces what a
rise or fall pushes, by the signs: a good way to check that the map says what the brief says. To show a ripple in
the story, `story step add <file> <scene> --label "<label>" --ripple <variable>=up|down` makes a step of it (see
section 8).

```bash
loopweft ripple garden.loopweft 'Invitations from members' up
```

### 6. Evidence

The brief gave no sources, so this map cites none: every link stays uncited, and Loopweft flags each one. That is
the honest state of the map. When the person gives you sources, add them and cite them where they support a link:

```bash
loopweft source add garden.loopweft --apa 'Example, A. (2020). *A fictitious source, to show the command*. Example Press.' --id example --label 'Example (2020)' --summary 'Not a real work.'
loopweft cite add garden.loopweft L1 example --pages 12 --strength moderate
loopweft source rm garden.loopweft example --cascade
```

(The source above is made up to show the commands, so it is removed straight away. Never leave one like it in a
map.) A real source with a DOI: `loopweft source lookup <doi>` shows the APA reference Crossref (or DataCite)
gives and what it lacks; `loopweft source add <file> --doi <doi>` adds it. These are the only commands that use
the network, and they send only the DOI. `--pages` takes what the source shows (`12`, `11–12`, `e11`); `--strength`
is `strong`, `moderate` or `weak`, the person's judgement of the support, so leave it out unless they gave it.
`cite list <file> --uncited` lists everything that still cites nothing.

### 7. Lay it out

Template maps come laid out. A variable you add is placed beside those that already have places, which stay where
they are; that keeps it in view, but not evenly spaced. So once you have added your variables, lay the whole map out
again:

```bash
loopweft layout garden.loopweft --auto force --seed 1
```

`constellation` groups variables by category, `force` clusters linked variables and keeps crossings few, `flow`
runs left to right. Variables pinned with `--pin` stay where they are.

### 8. Tell the story

A story is scenes of steps; each step is one keypress in the presentation, and everything moves smoothly from one
step to the next. Each step states the whole map (what is lit, what pulses, where the camera is), so a step
without map options shows the whole map plainly.

```bash
loopweft story scene add garden.loopweft --title 'Why the garden stopped growing' --headline 'Growth filled the plots, and the wait now holds it back.'
loopweft story step add garden.loopweft S1 --label 'The whole map'
loopweft story overlay add garden.loopweft S1.1 caption
loopweft story step add garden.loopweft S1 --label 'Members bring in members' --base dim --active L1,L2 --up 'Garden members' --name R1 --pulse-loop R1
loopweft story overlay add garden.loopweft S1.2 caption
loopweft story step add garden.loopweft S1 --label 'The wait puts people off' --base dim --active L3,L4,L5,L8 --up 'Waiting time for a plot' --name B2 --pulse-loop B2
loopweft story overlay add garden.loopweft S1.3 caption
loopweft story step add garden.loopweft S1 --label 'Close' --labels all
loopweft story overlay add garden.loopweft S1.4 statement --line 'More plots.' --line 'A shorter wait.' --style closing
loopweft story list garden.loopweft
```

Steps are named by scene and step (`S1.2`). The map options most stories need:

| Options | Do |
|---|---|
| `--base dim`, `--link-base ghost` | Fade everything the step does not list |
| `--focus <ids>`, `--active <ids>` | Light variables (by id or label) and links (by id); active is the strongest |
| `--up`, `--down`, `--mixed <variables>` | ▲ ▼ ± trends. They must agree with the signs of the lit links, or `validate` warns |
| `--ripple <variable>=up\|down` | A what-if step: the variable and what its rise or fall reaches lit, the rest faded, ▲ ▼ ± marked and pulses hop by hop (other options refine it) |
| `--badge <loops>`, `--name <loops>` | A loop's R/B badge, and its name |
| `--pulse-loop <loop>`, `--pulse <links>` (repeatable) | Glows that travel round a named loop, or along links hop by hop |
| `--frame <variables>`, `--whole-map` | What the camera frames |
| `--labels none\|focus\|view\|all` | Which labels show |
| `--reveal draw\|bloom` | How newly shown things arrive |

Overlays go over the map: `caption` (the scene's number, title and headline), `title`, `statement` (`--line`,
repeatable; `--style hero|question|closing|title|note`), `cards`, `legend` and `image`. A statement is large type:
keep each line to a few words, a closing line most of all (`More plots.`, not a sentence that explains the map);
the explaining belongs in the captions and the speaker notes. `story show <file> S1.2` shows a step in full, with
its warnings. Speaker notes: `story scene set <file> S1 --notes "<markdown>"`; write them only from what the person
gave you.

### 9. Check, then export

```bash
loopweft validate garden.loopweft
loopweft info garden.loopweft
```

`validate` exits 1 when there are errors (each with a code, a path and a message) and lists warnings. Loopweft
itself lets you export with warnings, but rule 5 does not: before exporting, fix every warning except
`uncitedLink` and `unknownSign`, which go in your report. The common ones:

| Warning | Means | What to do |
|---|---|---|
| `uncitedLink` | A link cites no source | Cite one the person gave you, or report it |
| `unknownSign` | A link's sign is `?` | Report it: the person decides |
| `unusedSource` | A source nothing cites | Cite it where it supports a link, or ask |
| `trendContradictsSign` | A ▲/▼ the lit links' signs contradict | Fix the trend, or light other links |
| `pulseOnHiddenLink` | A pulse on a link the step does not show | Show the link, or pulse another |
| `duplicateLabel` | Two variables with the same name | Rename one |

With 0 errors, and no warnings but uncited links and `?` signs, export:

```bash
loopweft export garden.loopweft --html
```

`--html` writes one HTML file that opens by double-click, offline: a start page, the slides and the presenter
console. `--no-notes` leaves the speaker notes out. Other exports: `--pdf notes|references` (no browser needed);
`--png`, `--svg`, `--pdf slides`, `--mp4`, `--webm` and `--gif`, which are drawn in the Chrome or Edge on the
computer and take longer (a whole-story video takes minutes). For a drawing someone will edit in PowerPoint
(Convert to Shape), add `--for-office` to `--svg`. An export never writes over a file unless you add `--force`.
Exports change nothing in the map.

## The report

End by telling the person, briefly:

1. **What you made or changed**: the file, its variables, links and named loops, and the story's steps.
2. **Where each link came from**, as its `Basis` says: the brief, a source (with pages), or the archetype; and
   **your own suggestions**, one by one, with the reasoning, so they can keep or remove them.
3. **Every `?` sign**, and what would settle it.
4. **What is uncited**, and any other warning `validate` still shows.
5. **The files you exported**, and where they are.

For the worked example: "garden.loopweft: the Limits to growth archetype, renamed for the garden, with one
variable added (5 variables, 8 links; R1 and B2 named, B2 named again once the waiting list was in it). From the
archetype: L1, L2, L4, L5. My suggestions (Basis: suggestion): L3, Garden members → Members on the waiting list
(+), which replaced the archetype's link from members straight to the waiting time; L6, Garden members →
Shortage of plots (+); L8, Members on the waiting list → Waiting time (+). One unknown sign, also my
suggestion: L7, Waiting time → Invitations (?): the brief does not say whether members stop inviting. No sources
were given, so all 8 links are uncited. Story: 1 scene, 4 steps. Exported garden.html. `validate`: 0 errors, 9
warnings (8 uncited links, 1 unknown sign)."

## More

- `loopweft info <file>`: what a project holds, in one screen.
- `loopweft meta <file>`: the title, description, author and course; `loopweft theme <file>`: the look
  (`--base cinematic-dark|light|high-contrast`, `--palette okabe-ito`, …).
- `loopweft story show <file> <step|scene>`: a step or scene in full.
- `loopweft paths <file> <from> <to>`, `loopweft connected <file>`: paths between variables; the most-connected
  ones (connected does not mean leverage).
- `loopweft type category|role|link|field add …`: categories (colours), roles (shapes), link types and custom
  fields.
- `loopweft import <csv|xlsx|kumu.json|.dataviz.json> -o <file>`: a map from tables, Kumu or DataViz.
- The file format: <https://github.com/TashiikiD/loopweft/blob/main/docs/format.md>.
