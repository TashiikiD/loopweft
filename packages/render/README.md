# @loopweft/render

Draws a project's map and plays its story. Given a project (and its theme), it works out what each step
shows and how a forward step moves; nothing here imports content of its own.

The pure part, which runs in Node as well as the browser:

- **`buildGraph`**: every placed variable and link with its position, size, colour (its category's), glyph
  (its role's shape) and curve (from `@loopweft/layout`). Hubs are the variables sized large; responses come
  from their role.
- **`namedLoops`**: the project's loops, each R or B from its links' signs, with the short name shown beside
  its badge.
- **`resolveMap`**: a step's map state as concrete levels, labels and camera; with `categoryWords`, also the
  category to name beneath each label (decision 22 of the format).
- **`schedule`**: the choreography of a forward step: which new links trace in and when, when variables and
  loop badges arrive, when pulses leave and land, and in which tone.
- **`ambientWalker`**: the soft pulses that wander a held step, true to the link signs.
- **`shapeGlyph`**, **`TREND_GLYPH`**, **`LOOP_ARROW`**: the glyphs, as plain element descriptions.
- **`THEMES`**, **`themeTokens`**: the colour and type tokens of each base theme (the cinematic one is the
  deck's), and **`categoryColours`**: each category's own colour, else its place in the theme's palette.
- **`checkCategories`**, **`checkPalette`**: which colours become hard to tell apart for the three common
  colour-vision deficiencies and in greyscale (DataViz's check, copied in `colour/`), and which stand out too
  little from the stage.

The browser part, animated with `@loopweft/motion`:

- **`StoryView`**: a 1920 × 1080 stage scaled to fit its host, with the map and the overlays; `show(scene,
  step, transition)` moves to a step `instant`ly, with a `quick` fade (going back) or with its full motion
  (`smooth`, going forward). `storyPositions` lists every step.
- **`MapView`**: the map itself. A forward step traces new links in, pops loop badges, sends pulses and lands
  trend badges; a held step can keep soft pulses wandering. Labels are HTML, placed against the step's final
  camera to keep clear of lit links, other labels and reserved text. Each view's SVG ids are its own, so
  several maps can share a page. `setCategoryWords` (also on `StoryView`) names each shown variable's
  category in words beneath its label, without playing the step again.
- **Overlays**: the scene caption, title page, statements, card columns, the legend (built from the project's
  roles) and images, stacked in the order a step lists them.
- **`render.css`** (`@loopweft/render/render.css`): the styles, scoped to the stage, coloured from the theme's
  tokens.

Pause, Skip and low-power mode reach everything through the `Motion` that plays it.

Ported from the polycrisis deck (`src/map/graph.ts`, `loops.ts`, `resolve.ts`, `choreo.ts`, `map-view.ts`,
`minimap.ts`, `src/viz/statement.ts`, `cards.ts`, `legend.ts`, `title.ts`, `kit.ts`, `src/stage/stage.ts`,
`src/audience/placeholder.ts` and its styles); each file names its source.
