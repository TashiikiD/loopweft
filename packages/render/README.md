# @loopweft/render

Draws a project's map and plays its story. Given a project (and its theme), it works out what each step
shows and how a forward step moves; nothing here imports content of its own.

The pure part, which runs in Node as well as the browser:

- **`buildGraph`**: every placed variable and link with its position, size, colour (its category's), glyph
  (its role's shape) and curve (from `@loopweft/layout`). Hubs are the variables sized large; responses come
  from their role.
- **`namedLoops`**: the project's loops, each R or B from its links' signs, with the short name shown beside
  its badge.
- **`resolveMap`**: a step's map state as concrete levels, labels and camera.
- **`schedule`**: the choreography of a forward step: which new links trace in and when, when variables and
  loop badges arrive, when pulses leave and land, and in which tone.
- **`ambientWalker`**: the soft pulses that wander a held step, true to the link signs.
- **`shapeGlyph`**, **`TREND_GLYPH`**, **`LOOP_ARROW`**: the glyphs, as plain element descriptions.
- **`THEMES`**, **`themeTokens`**: the colour and type tokens of each base theme (the cinematic one is the
  deck's), and **`categoryColours`** for categories that name no colour.

Ported from the polycrisis deck (`src/map/graph.ts`, `loops.ts`, `resolve.ts`, `choreo.ts`, and the glyphs
and walks of `map-view.ts`); each file names its source.
