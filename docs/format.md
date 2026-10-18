# The `.loopweft` file format, version 1

Status: **draft for review** (Phase 0). Until Loopweft 1.0 is released, version 1 may still change without a
migration; after that, every change gets a new version number and an automatic upgrade.

A `.loopweft` file holds one project: a causal map, the evidence behind it, and an animated story told
over it. This document says what each part means. The machine-readable version of the same rules is the
JSON Schema at <https://tashiikid.github.io/loopweft/schema/v1.json>
(`packages/model/schema/loopweft.v1.schema.json`), generated from the zod schema in
`packages/model/src/schema.ts`.

## Contents

1. [A first look](#1-a-first-look)
2. [Ground rules](#2-ground-rules)
3. [meta and theme](#3-meta-and-theme)
4. [types: categories, roles, link types, fields](#4-types)
5. [variables](#5-variables)
6. [links](#6-links)
7. [citations and sources](#7-citations-and-sources)
8. [loops](#8-loops)
9. [layout](#9-layout)
10. [story: scenes and steps](#10-story)
11. [what a step shows: the map state](#11-the-map-state)
12. [overlays](#12-overlays)
13. [assets](#13-assets)
14. [checking a project](#14-checking-a-project)
15. [writing a project: the canonical form](#15-the-canonical-form)
16. [versions and migrations](#16-versions-and-migrations)
17. [the shorthand](#17-the-shorthand)
18. [decisions](#18-decisions)

## 1. A first look

The smallest valid file:

```json
{
  "format": "loopweft",
  "version": 1,
  "meta": { "title": "Population" }
}
```

A small map with one loop, one source and a one-step story:

```json
{
  "$schema": "https://tashiikid.github.io/loopweft/schema/v1.json",
  "format": "loopweft",
  "version": 1,
  "meta": { "title": "Population" },
  "variables": [
    { "id": "births", "label": "Births", "citations": [] },
    { "id": "population", "label": "Population", "citations": [] }
  ],
  "links": [
    { "id": "L1", "from": "births", "to": "population", "sign": "+", "citations": [{ "source": "T", "pages": "4" }] },
    { "id": "L2", "from": "population", "to": "births", "sign": "+", "delay": true, "citations": [{ "source": "T", "pages": "5" }] }
  ],
  "loops": [{ "id": "R1", "name": "More people, more births", "links": ["L1", "L2"], "citations": [] }],
  "sources": [{ "id": "T", "apa": "Author, A. (2020). *A book about population*. Publisher." }],
  "story": {
    "scenes": [
      {
        "id": "S1",
        "title": "Growth",
        "steps": [
          {
            "id": "1",
            "label": "The loop",
            "map": { "links": { "base": "dim", "active": ["L1", "L2"] }, "loops": ["R1"], "pulses": { "hops": [["L1"], ["L2"]] } },
            "overlays": [{ "type": "caption" }]
          }
        ]
      }
    ]
  }
}
```

[`examples/polycrisis.loopweft`](../examples/polycrisis.loopweft) is a full project: 41 variables, 132 links,
18 named loops, 14 sources and a story of 11 scenes and 70 steps.

### The sections

| Section | Holds | Required |
|---|---|---|
| `$schema` | The address of the JSON Schema, for editors | no |
| `format` | Always `"loopweft"` | yes |
| `version` | The format version: `1` | yes |
| `meta` | Title and description | yes |
| `theme` | How the project looks | no |
| `types` | Categories, roles, link types and custom fields | no |
| `variables` | The things that rise or fall | no |
| `links` | Who influences whom, and in which direction | no |
| `layout` | Where things are drawn | no |
| `loops` | Named feedback loops | no |
| `sources` | The works the map cites | no |
| `story` | Scenes of steps, one keypress each | no |
| `assets` | Embedded images | no |

A section that is left out is empty (no variables, no links…). Files that Loopweft writes always include
every section.

## 2. Ground rules

- **One UTF-8 JSON file.** Images are embedded, so the file is complete on its own.
- **Strict.** A field the format does not know is an error, not ignored, so a typo (`"lable"`) never passes
  silently. The message suggests the field you probably meant.
- **Nothing is invented.** A required value that is missing is an error. Loopweft never fills in a sign, a
  citation, a page or a count. An unknown sign is written `?` and flagged.
- **Ids.** Every variable, link, loop, source, scene, step, category, role, link type, field, group and asset
  has an `id`: 1 to 80 letters (any script), digits, `_` or `-`; no spaces or dots. Variables, links and
  loops share one set of ids, so an id like `R1` names exactly one thing. A step id is unique within its
  scene, and `S05.3` names the step with id `3` in scene `S05`.
- **Optional fields.** Leave out a field that does not apply. Where the absence has a meaning, this document
  says so (for example, a link without `conditional` is not conditional).
- **Text** is plain text. Speaker notes are Markdown. APA references mark italics with `*asterisks*`.
- **Colours** are written `#rrggbb`. **Dates** are `YYYY-MM-DD`, or a full ISO 8601 date and time.

## 3. meta and theme

### meta

| Field | Meaning |
|---|---|
| `title` | The title of the map and its story. **Required.** |
| `description` | What the map is and is not, e.g. "a qualitative synthesis, not a model". |
| `author`, `course` | Who made it, and for which course. |
| `created`, `modified` | Dates. Loopweft stamps `modified` when it saves; nothing in the model reads the clock. |

### theme

| Field | Meaning |
|---|---|
| `base` | The look: `cinematic-dark` (the default), `light` or `high-contrast`. |
| `palette` | The colour preset for categories that name no colour of their own (below). Left out: `loopweft`. |
| `fonts` | `heading` and `body` font families, e.g. `Fraunces` and `Inter`. |

A category without a `colour` takes the colour of its place in the category list from the palette, starting
again at the first after the last, so a colour that a category names never shifts the others.

| Palette | Colours |
|---|---|
| `loopweft` | The polycrisis presentation's seven domain colours, then five more like them (12). |
| `okabe-ito` | Okabe and Ito's Color Universal Design colours, without black, which would vanish on a dark stage (7). |
| `tol-bright` | Paul Tol's bright qualitative scheme (7). |
| `tol-muted` | Paul Tol's muted qualitative scheme (9). |

Loopweft measures how a project's category colours look to people with the three common colour-vision
deficiencies (protanopia, deuteranopia, tritanopia) and in greyscale, names the pairs that become hard to tell
apart, and names the colours that stand out too little from the theme's stage (a contrast below 3:1, as WCAG
2.1 asks of graphics). These are advice, not errors: the project stays valid.

## 4. types

The vocabulary of the map. Each list starts empty.

### Categories

A category groups variables and gives them a colour, like the polycrisis map's seven domains.

| Field | Meaning |
|---|---|
| `id`, `name` | **Required.** |
| `colour` | `#rrggbb`. Left out: the theme's palette assigns one. |
| `description` | |

### Roles

A role is the part a variable plays, shown by its glyph's shape, like stress, trigger, crisis and response.

| Field | Meaning |
|---|---|
| `id`, `name` | **Required.** |
| `shape` | **Required.** `circle`, `ring`, `square`, `rounded-square`, `octagon`, `diamond`, `triangle` or `hexagon`. |
| `description` | |
| `response` | `true` for responses: deliberate actions against the pressures, such as policies or interventions. A pulse arriving at a response shows relief unless a trend says otherwise, and relief walks leave a response along its `-` links (see the map state). Default: `false`. |

### Link types

A link type is a kind of link, such as a mechanism ("cascade", "feedback").

| Field | Meaning |
|---|---|
| `id`, `name` | **Required.** |
| `description` | |
| `style` | `solid` (the default), `dashed` or `dotted`. |
| `marker` | `none` (the default) or `flag`, a small mark at the middle of the link. |
| `optional` | `true` for links that are not part of the map's main structure, such as documented possible side-effects. They stay hidden until a step lists them, and automatic loop counts leave them out (a named loop may still use them). Default: `false`. |

A link marked `conditional` is drawn dashed when it is lit, whatever its type.

### Custom fields

Extra facts that variables or links can carry.

| Field | Meaning |
|---|---|
| `id`, `name` | **Required.** |
| `kind` | **Required.** `text`, `number`, `choice` or `boolean` (true or false). |
| `appliesTo` | `variables`, `links` or `both` (the default). |
| `options` | For a `choice` field, **required**: each with an `id`, a `name` and an optional `description`. Only choice fields have options. |
| `description` | |

A variable or link stores its values in `fields`, by field id: `"fields": { "evidence": "explicit" }`. A
choice holds the option's id. The polycrisis map keeps its evidence level (explicit, synthesis,
illustrative) this way, with the definitions as option descriptions.

## 5. variables

A variable is something that can rise or fall.

| Field | Meaning |
|---|---|
| `id` | **Required.** |
| `label` | The full name. **Required.** |
| `mapLabel` | A shorter name drawn on the map; `\n` breaks the line (`"Food-price\nshocks"`). |
| `category`, `role` | Ids from `types`. |
| `definition` | What the variable means: what exactly rises or falls. |
| `size` | `normal` (the default) or `large`, for a hub. |
| `fields` | Custom field values. |
| `citations` | Sources for the variable (see 7). Written even when empty. |

## 6. links

A link says that a change in one variable (`from`) tends to change another (`to`).

| Field | Meaning |
|---|---|
| `id` | **Required.** |
| `from`, `to` | Variable ids. **Required.** |
| `sign` | **Required.** `+`: the target tends to move in the same direction as the source. `-`: in the opposite direction. `?`: not known. All else equal; the sign says nothing about the size of the effect or whether it is good or bad. |
| `type` | A link type id. |
| `conditional` | `true` when the effect holds only under some conditions (drawn dashed when lit). Default: `false`. |
| `delay` | `true` when the effect takes notably long. |
| `delayLabel` | How long, e.g. `"5 yrs"`. Needs `delay`. |
| `confidence` | `low`, `medium` or `high`. |
| `weight` | Relative strength of the influence, 0 or more, for line thickness. No units. |
| `rationale` | Why the cause moves the effect: the mechanism, in a sentence or two. |
| `fields` | Custom field values. |
| `citations` | Sources for the link (see 7). Written even when empty, so an uncited link is plain to see. |

`sign`, `delay` and `confidence` follow DataViz, so its projects and shorthand convert without loss (its
`L`, `M`, `H` become `low`, `medium`, `high`).

## 7. citations and sources

### Citations

Variables, links, loops and some overlays carry a list of citations.

| Field | Meaning |
|---|---|
| `source` | A source id. **Required.** |
| `pages` | Pages or another locator: `"7"`, `"11–12"`, `"e11"`, `"S4"`. Up to 60 characters. |
| `strength` | How strongly the source supports this element, in the author's judgement: `strong`, `moderate` or `weak`. |
| `note` | A figure, table or short quotation, e.g. `"Fig. 6c"`. |

The same source may be cited twice for different pages.

### Sources

| Field | Meaning |
|---|---|
| `id` | **Required.** Short tags work well: `L`, `RI`. |
| `label` | The short in-text form, e.g. `"Lawrence et al. (2024)"`. |
| `apa` | The full APA 7 reference. **Required.** `*asterisks*` mark italics. |
| `doi` | The bare DOI, e.g. `10.1017/sus.2024.1` (not the `https://doi.org/` address). |
| `url` | A web address starting with `http://` or `https://`. |
| `licence` | The licence the source states for itself, e.g. `"CC BY 4.0"`. |
| `summary` | What the map draws from it. |
| `partOf` | For a supplement: the id of the work it belongs to. The reference list shows it beneath that work. |

The reference list is generated: alphabetical by first author as APA orders it (italics marks ignored),
supplements under their work, each with the scenes that draw on it.

## 8. loops

A named feedback loop: a closed chain of links.

| Field | Meaning |
|---|---|
| `id`, `name` | **Required.** |
| `links` | The link ids in order around the loop: each starts where the one before ends, and the last ends where the first starts. **Required.** |
| `archetype` | A system archetype it follows, e.g. `"Fixes that fail"`. |
| `description` | What the loop does. |
| `caution` | What it does not show, e.g. `"A conceptual archetype, not a measured loop."` |
| `citations` | Sources for the loop. |

A loop is **reinforcing (R)** when an even number of its links are `-`, **balancing (B)** when the number is
odd, and of unknown polarity when any link is `?`. This is worked out from the signs, never stored, so it
cannot drift from them.

Loopweft also finds every loop automatically (Johnson's algorithm, each loop once). Counts leave links of
optional types out, can be limited to loops of up to a given length, and stop at a limit (ten million by
default), in which case they are reported as "at least".

## 9. layout

Where things are drawn, in map units. The polycrisis layout fills a 1920 × 1080 area.

| Field | Meaning |
|---|---|
| `positions` | By variable id: `x`, `y`, an optional `labelSide` (`above`, `below`, `left`, `right`; left out: placed automatically) and `pinned` (`true`: automatic layouts leave it where it is). A variable without a position is placed automatically. |
| `groups` | Visual groups, usually one per category: an `id`, an optional `category` (for the colour), `label`, `halo` (`x`, `y`, `r`: a soft circle behind the group) and `labelAt` (`x`, `y`). |
| `bends` | By link id: the curve of a link as a fraction of its length, from −1 to 1; positive bends to the left. Links not listed are curved automatically. |
| `home` | The whole-map view: the map point at the centre of the stage (`x`, `y`) and the `zoom` (stage pixels per map unit). Steps that show the whole map use it, and a step that frames some variables never shows them smaller than it. Left out: the whole map is fitted below the caption band. |

## 10. story

The story is a list of **scenes**, each a list of **steps**. A step is one keypress: the presenter presses
a key, and the map and overlays move from the last step's state to this one's.

### Scenes

| Field | Meaning |
|---|---|
| `id`, `title` | **Required.** |
| `headline` | The scene's one-line message, shown in its caption. |
| `targetSeconds` | How long the scene should take. Left out: untimed (like a title page). |
| `notes` | Speaker notes in Markdown, for the presenter only. |
| `script` | A full script, for the presenter only; `[>]` marks each keypress. |
| `sources` | Sources the scene draws on beyond those its lit links and overlays cite. |
| `steps` | The steps. **Required** (may be empty while being written). |

### Steps

| Field | Meaning |
|---|---|
| `id` | **Required.** Unique within the scene. |
| `label` | A short name, for the presenter. **Required.** |
| `at` | Seconds into the scene when the step should arrive, for pacing. |
| `cue` | What happens on this step, for the presenter. |
| `map` | What the map shows (see 11). **Required:** every step states the whole map, not a change. |
| `overlays` | What is drawn over the map (see 12). |

The sources listed for a step are worked out: those its overlays cite, and those cited by the variables
and links it lights and the loops it badges.

## 11. The map state

Every field is optional; `{}` shows the whole map plainly, with the labels in view.

| Field | Meaning |
|---|---|
| `show` | `false` hides the map. Default `true`. |
| `opacity` | From 0 to 1. Default 1. |
| `camera` | `fit`: variables to frame (with room for their labels; left out: the whole map). `frame`: where on the stage the subject goes: `center` (the default), `full`, `left`, `right`, `lower` or `inset` (the whole map shrunk into a small central area). `maxZoom`: a limit, so small groups don't fill the screen. |
| `variables`, `links` | Emphasis levels (below). |
| `labels` | Which variable labels show: `none`, `focus` (those at focus or active), `view` (those in view; the default) or `all`. |
| `categoryLabels` | `true` shows the group labels. |
| `labelText` | Label text for this step only, by variable id (e.g. one word each). |
| `trends` | ▲ `up`, ▼ `down` or ± `mixed` (where opposing influences meet), by variable id. |
| `loops` | Loops whose R/B badge shows. |
| `loopNames` | Loops whose name shows beside their badge. |
| `reveal` | How newly shown things arrive. `mode`: `draw` (new links trace themselves from their source; the default) or `bloom` (the map fades in ring by ring). `from`: the variables it grows out from. `sequence`: an exact order, one beat each (variable ids appear, link ids trace). `stagger`: seconds between beats. `delay`: seconds before the first. |
| `pulses` | Glows that travel along links. `hops`: lists of links pulsed together; each hop leaves when the one before arrives. `repeat`: extra passes (going round a loop again). `delay`. `tone`: `harm`, `relief` or `mixed` for every pulse; left out, each pulse takes its target's trend, else `relief` when the target is a response, else its source's trend, else `harm`. |
| `ambient` | Pulses that keep wandering the lit map while the step is held, for a title or a close. `from`: start variables. `tone`: `harm` (walks follow `+` links: an increase spreading) or `relief` (a decrease spreading along `+` links; a walk that starts at a response first leaves it through one of its `-` links). `every`: seconds between walks, `[min, max]`. `hops`: links per walk, `[min, max]`. `delay`. |
| `clusters` | Group halos: `show` (the default), `dim` or `hide`. |
| `minimap` | `true` or `false`. Left out: shown when zoomed in. |

### Emphasis levels

From faintest to strongest: `hidden`, `ghost`, `dim`, `normal`, `focus`, `active`. **Lit** means focus or
active.

```json
"variables": { "base": "dim", "focus": ["food_insecurity"], "active": ["economic_insecurity"] },
"links": { "base": "ghost", "active": ["E033", "E034"] }
```

- `base` is the level of everything not listed (default `normal`).
- An id listed at two levels takes the higher one (and is flagged).
- Links of an optional type are hidden unless listed.
- Both ends of a visible link are shown, at up to normal strength.

## 12. overlays

Overlays are drawn over the map in list order, later ones on top. Each has a `type`. Where one has a
`place`, it is one of `top-left`, `top`, `top-right`, `left`, `center`, `right`, `bottom-left`, `bottom` or
`bottom-right`; left out, the overlay's usual place.

| Type | Fields | Shows |
|---|---|---|
| `caption` | none | The scene's caption band: its title and headline. |
| `title` | `title` (required), `subtitle`, `lines` | A title page over the map. |
| `statement` | `lines` (required), `kicker`, `style`, `place`, `citations` | Large type: a question, a closing line, a short title or a caveat. `style`: `hero`, `question`, `closing`, `title` or `note`. `kicker`: a small line above, e.g. "INTERVENTION A". |
| `cards` | `items` (required: each a `title`, an optional `sub` and an optional `icon`), `title`, `active`, `place`, `citations` | Cards: a column beside the map (`left`, the default, or `right`), or a compact grid in the top or bottom band. `active`: the highlighted cards, counted from 0; the rest recede. A card shows its `icon` in place of its number. |
| `legend` | `place`, `citations` | The project's roles and link styles. |
| `image` | `asset` and `alt` (required), `caption`, `credit`, `place`, `citations` | An embedded image. `alt` says what it shows, for people who cannot see it. |

### Card icons

Small built-in icons, drawn in the card's text colour:

- role shapes, as the map draws them: `circle`, `ring`, `square`, `rounded-square`, `octagon`, `diamond`,
  `triangle`, `hexagon`;
- link marks: `increases` (an arrowhead), `decreases` (a bar), `conditional` (a dashed line);
- loop marks: `feedback` (a circular arrow), `reinforcing` (around R), `balancing` (around B);
- ways crises become entangled: `common-stress` and `common-trigger` (a fan of arrows from a slow stress or a
  trigger), `domino` (a chain);
- leverage at depth: `broken-link`, `root`.

## 13. assets

Embedded images, by id, as base64 data URIs: PNG, JPEG, GIF, WebP or SVG.

```json
"assets": { "chart": "data:image/png;base64,iVBORw0KGgo..." }
```

## 14. Checking a project

Loopweft checks a project in four stages. The first three find **errors**, which make the project invalid.
The last finds **warnings**: the project is valid, but something should be looked at. Every problem has a code, a path (`links[3].from`) and a plain message.

1. **Format and version:** `invalidJson`, `notLoopweft`, `unsupportedVersion`, `newerVersion` (made by a
   newer Loopweft).
2. **Structure:** `missingField`, `unknownField`, `invalidType`, `invalidValue`, `invalidFormat` (an id,
   colour, date, DOI or address written wrongly), `invalidId`, `empty`, `tooFew`, `tooMany`, `tooSmall`,
   `tooBig`, `tooLong`, `choiceWithoutOptions`, `optionsWithoutChoice`, `delayLabelWithoutDelay`.
3. **References:** every id must exist and be unique. `duplicateId`, `unknownVariable`, `unknownLink`,
   `unknownLoop`, `unknownSource`, `unknownCategory`, `unknownRole`, `unknownLinkType`, `unknownField`,
   `unknownAsset`, `unknownElement`, `fieldNotApplicable`, `invalidFieldValue`, `brokenLoop` (a loop's links
   do not form a closed chain), `partOfCycle`, `invalidRange` (a `[min, max]` the wrong way round),
   `cardOutOfRange`.
4. **Evidence and story (warnings):**

| Code | Means |
|---|---|
| `uncitedLink` | A link cites no source. |
| `unknownSign` | A link's sign is `?`: loops through it have no polarity, and ripples stop there. |
| `unusedSource` | A source nothing cites (a cited supplement counts for its work). |
| `duplicateLabel` | Two variables have the same name, so names cannot tell them apart. |
| `duplicateCitation` | The same source and pages cited twice on one element. |
| `duplicateLink` | Two links with the same ends and type. |
| `selfLink` | A link from a variable to itself. |
| `loopRevisits` | A named loop passes through a variable twice. |
| `emptyScene` | A scene with no steps. |
| `trendContradictsSign` | A ▲/▼ that the signs of the lit links contradict: along a lit link, the target must move as the source does times the sign (± is left open; a response at the active level with no trend counts as rising). |
| `pulseOnHiddenLink` | A pulse on a link that is not visible. |
| `pulseBeforeArrival` | A pulse leaves a variable before any earlier pulse reaches it. |
| `loopNameWithoutBadge` | A loop name shown without its badge. |
| `trendBarelyVisible` | A trend on a variable that is barely visible. |
| `listedTwice` | An id listed at two emphasis levels. |

The polycrisis example has no errors and no warnings.

## 15. The canonical form

Loopweft writes every project the same way, so the same project always gives the same bytes and changes
read well in a diff:

- `$schema` first, then the sections in the order of the table in 1; inside each object, fields in the
  order this document lists them.
- Maps keyed by id (`positions`, `bends`, `assets`, `fields`, `labelText`, `trends`) sorted by key.
- Lists keep their order: the order of variables, links, scenes and steps is the author's.
- Two-space indentation, LF line endings, a final newline, UTF-8 without a byte-order mark.

Nothing that writes a project reads the clock or draws random numbers; anything random (where ambient
pulses wander) is seeded when it is drawn.

## 16. Versions and migrations

`version` is a whole number. A file of an older version is upgraded on opening, one version at a time;
each upgrade must carry every value across or stop with an error, never guess. A file of a newer version is
refused with a message to update Loopweft. Version 1 is the first: there are no upgrades yet.

## 17. The shorthand

Links can be typed rather than drawn, in DataViz's shorthand:

```text
Births -> Population (+)
Population -> Deaths (+, delay "5 yrs")
Deaths -> Population (-)
Fertility -> Births (?, conf=M)
@group social: Births, Population
```

- Arrows: `->`, `-->` or `→`. One link per line; `#` or `//` starts a comment.
- Names match variables by id or label (ignoring case and spacing); new names become variables. Quote a
  name that contains an arrow, a comma or brackets.
- In the brackets: a sign (`+`, `-`, `?`, or words such as `positive`, `opposite`), `delay` with an optional
  label, `conf=` (`low`, `medium`, `high`, or `L`, `M`, `H`), `weight=` or `strength=`, and `field=value` for
  `type`, `conditional`, `rationale`, `delayLabel` or a custom field (by id or name).
- A line without a sign records `?`, with a warning. `@group name: A, B` puts variables in a category,
  making it if needed.
- Values are read strictly: `weight=heavy` is an error, not text. A link that already exists is an error.
  Nothing changes if any line has an error, and every error is reported at once with its line and column.

## 18. Decisions

These choices refine the plan's sketch. Items 1–15 were confirmed at the Phase 0 checkpoint review and 16–19 at the
Phase 1 checkpoint review; 20 is to be confirmed at the Phase 2 checkpoint review. Each can still change before
version 1 is released.

1. **`pinned` lives in the layout** (`layout.positions.<id>.pinned`), not on the variable, so all layout
   state is in one place.
2. **Links have `rationale`** where the sketch said `note`: the field holds the mechanism behind the arrow.
3. **Variables have `mapLabel`** for the short, line-broken names drawn on the map, beside the full `label`.
4. **`size: "large"`** marks hubs, replacing the deck's fixed list of hub nodes.
5. **Loops do not store R or B.** It is worked out from the signs, so a flipped sign updates it.
6. **Optional link types** carry the deck's side-effect behaviour: hidden until a step lists them, left out
   of loop counts.
7. **Evidence levels are a custom field** in the example (explicit, synthesis, illustrative), because the
   deck rates each link, not each citation. Citation `strength` (strong, moderate, weak) is left unset there
   rather than guessed.
8. **Confidence is written `low`, `medium`, `high`**, with DataViz's `L`, `M`, `H` accepted when converting.
9. **Overlays are listed per step**, including the scene caption (`{ "type": "caption" }`), so each step is
   complete on its own; the caption text comes from the scene. Scene numbers are not stored in captions.
10. **Story problems are warnings, not errors** (the deck stopped on them): a project being edited can be
    saved with them, and they are shown until fixed.
11. **Labels default to "in view"** (the deck's default was none, so the converted example says `"none"`
    where the deck relied on it).
12. **Variables, links and loops share one set of ids**, so an id such as `R1` names exactly one thing.
13. **No link labels.** DataViz's `label=` in the shorthand is refused with a pointer to `rationale=`.
14. **Speaker notes are one Markdown text** per scene. The example keeps each scene's tone line, guided notes
    and key facts in it.
15. **The example leaves out the author and course** (`meta.author`, `meta.course`) and the presenter's
    lines on the title page; add them back if you want the example credited.
16. **Roles can mark responses** (`response: true`; added in Phase 1, confirmed at its checkpoint). The deck
    coloured a pulse arriving at an intervention as relief and started relief walks along an intervention's
    `-` links, so the renderer needs to know which variables are responses. The example marks its
    intervention role.
17. **Cards can carry small built-in icons** (`icon`; confirmed at the Phase 1 checkpoint), as the deck's
    panels of the ways crises become entangled and of leverage at depth did. The icons are a fixed set, so
    they always match the map's glyphs and the theme.
18. **The example keeps the presentation's curves** (confirmed at the Phase 1 checkpoint): where Loopweft's
    crossing refinement would re-bend a link of the example, its bend is written into `layout.bends`. Other
    maps get the refinement.
19. **An optional home view in the layout** (`layout.home`; added in Phase 2, as agreed at the Phase 1 checkpoint
    review): the whole-map camera, set from the Studio's canvas. The example takes the presentation's own
    (centre 960, 478; zoom 0.9), so its whole-map steps are framed as the presentation framed them.
20. **Palettes are named presets** (`theme.palette`; added in Phase 2): an unknown name is an error, never a quiet
    fallback, and a category's own colour always wins. The colour checks are advice, not validation.
