# @loopweft/export

Every export but the one-file HTML (that one is `@loopweft/player`'s): so far, pictures (PNG). SVG drawings,
the PDFs and video follow in Phase 6. See [exporting](../../docs/export.md) for what each export holds.

- **The export page** (`page/`): the engine (`src/engine.ts`) on a 1920 × 1080 stage, with Loopweft's fonts
  and the stage's styles, built into one HTML file by `build/page.ts`, as the player's page is. The Studio
  runs it in a hidden frame (`build/plugin.ts` gives it to the Studio's build as
  `virtual:loopweft-export-page`); the command line runs it in a headless browser (`node/`).
- **Frames** (`src/frame.ts`): the stage drawn by the browser itself. The stage's HTML and SVG, with the
  page's styles and fonts, go inside an SVG `<foreignObject>`, which is drawn onto a canvas. Every box of the
  copy keeps the size the page gave it. The result matches the audience window within the drawing's rounding.
- **The stage** (`src/stage.ts`): the project's `StoryView`, moved only by a manual clock, with fonts loaded
  and images decoded before anything is shown. Each job draws on a stage of its own and reaches a step through
  the story from its first step, as a talk does.
- **What a job draws** (`src/pictures.ts`): one step, every step in story order, or the whole map; file
  names; the options' checks. Pure, so the Studio, the command line and the tests agree without a browser.
- **Node** (`node/`): finds Chrome or Edge (`LOOPWEFT_CHROME` names another) and drives it headless over its
  DevTools protocol, through a pipe (no port is opened). Each run has a throwaway profile and none of the
  browser's background traffic. The browser keeps its graphics path: without it (`--disable-gpu`), text inside
  a frame lands about a pixel from where the page draws it. `exportInBrowser(text, job, onFile)` opens a
  project, runs one job and hands back each file it makes.

Nothing reads the clock. The same project gives the same pictures in the same browser on the same computer,
byte for byte.
