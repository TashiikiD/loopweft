# @loopweft/export

Every export but the one-file HTML (that one is `@loopweft/player`'s): so far, pictures (PNG), drawings
(SVG), and the slides, speaker notes and references PDFs. Video follows in Phase 6. See [exporting](../../docs/export.md) for what each export holds.

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
- **SVG drawings** (`src/svg/`): the laid-out stage read back and written as true SVG (`flatten.ts`): boxes
  with their backgrounds (CSS gradients as SVG gradients, `css.ts`), borders, shadows and masks; text as one SVG
  text per line, placed where the page placed it, its baseline measured in the page; the map's own SVG copied
  with its colours written out; CSS filters (glows) as SVG filters. The page's painting order is followed for
  what Loopweft's stylesheet uses (a backdrop at z-index -1 drawn with its stacking context). `fonts.ts` embeds
  only the font files the drawing uses; `writer.ts` writes numbers to two decimals and numbers ids in drawing
  order, so the same stage gives the same bytes. What the drawing cannot carry across exactly goes in its notes.
- **The PDF documents** (`src/pdf/`): pure TypeScript on pdf-lib, the same in Node and in the browser. A
  document is a list of blocks (`notes.ts`, `references.ts`; speaker notes' Markdown through `markdown.ts`),
  set by `typeset.ts`: runs in six styles, lines broken at spaces (a long web address after a slash), headings
  kept with what follows, short paragraphs kept whole, slide marks as chips, links, bookmarks and footers.
  `fonts.ts` picks, for each character, the first font file of its style that has it (Fraunces, then Inter, then
  Noto Sans Math), reads only those files and embeds only the letters used; `document.ts` sets the properties and
  the date (the project's own, never the clock). `slides.ts` puts the export page's JPEG of each step on a 16:9
  page, with a bookmark at each scene.
- **What a job draws** (`src/pictures.ts`): one step, every step in story order, or the whole map; file
  names; the options' checks. Pure, so the Studio, the command line and the tests agree without a browser.
- **Node** (`node/`): finds Chrome or Edge (`LOOPWEFT_CHROME` names another) and drives it headless over its
  DevTools protocol, through a pipe (no port is opened). Each run has a throwaway profile and none of the
  browser's background traffic. The browser keeps its graphics path: without it (`--disable-gpu`), text inside
  a frame lands about a pixel from where the page draws it. `exportInBrowser(text, job, onFile)` opens a
  project, runs one job and hands back each file it makes.

Nothing reads the clock. The same project gives the same pictures in the same browser on the same computer,
byte for byte.
