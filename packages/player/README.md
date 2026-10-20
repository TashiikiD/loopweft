# @loopweft/player

The presentation runtime: it presents a project's story with a presenter console and an audience window, or
in one window for a rehearsal, in the Studio and in a one-file HTML export. It is plain DOM and TypeScript
(no React), so the exported file stays small and runs the same code as the Studio.

Built so far (Phase 5, in slices):

- `deckOf`: the deck a story makes: its scenes that have steps, each with its number (the scenes that show a
  caption, counted from 1), its target and its place on the presenter's clock; moving step by step, by
  scene, to a scene's number, and reading step addresses (`#S04.2a`) back.
- `reduce`: the show state (the step, how it was reached, skip, pause, blackout, low power, categories in
  words) and the commands that change it. Pure: it is given the time.
- `mapKey`: the presentation keys, as the polycrisis deck had them, clickers included (PageDown/PageUp,
  B or . to blank, F5 ignored, a held key never races through steps); `JumpBuffer` for "a number, then Enter".
- `pace`: the presenter's clock and how they are doing against each scene's target (on pace within 15 s, late
  to 45 s, very late beyond).
- `Link` and `ShowSession`: the windows of one presentation kept in step. Every message goes over a
  BroadcastChannel where one opens and straight to the windows each window knows (the one that opened it, the
  ones it opened, any it heard from), so a file opened from disk works too; the newest change wins, and a
  reloaded window finds the show again.
- `PresentationStore`: where each window remembers its place, clock and preferences, per presentation, and
  works without storage.

- `startAudience`: the audience window. The story on the stage and nothing else: a thin progress bar sized by
  the scenes' targets (H hides it), blackout, the pointer hidden while still, a hint at the start, full
  screen on F or a double-click, the screen kept awake, a tap or swipe to step on touch screens. Opened to
  rehearse alone, it shows rehearsal notes on N (the step's cue, what comes next, the scene's speaker notes
  and the presenter's clock, started on T); they never open while a presenter console is connected.
- `parseMarkdown`, `markdownToDom`: speaker notes read safely (nothing in them is ever read as HTML).
- `PresenterClock`: the presenter's clock, kept in the presentation's storage, so the console and a
  rehearsal share it.
- `startConsole`: the presenter console, the presenter's private view:
  - the scene and step;
  - Now and Next with their cues and due times;
  - the clocks (total, this scene against its target, pace, time left against the scenes' targets added up);
  - the scene's speaker notes (G) or its script with each key mark, the next one lit (F);
  - a live copy of the audience's screen;
  - the scene's steps and a strip of scenes, each a click to go there;
  - "On screen now: its evidence": every lit link's sign, type, conditions, mechanism and citations with
    pages, the lit variables' citations, the loops badged, and what the overlays cite;
  - the scene's sources;
  - Open audience window, and Send to projector (Chrome and Edge place it on the second screen).
  It answers an audience window that has no copy of the project (the Studio's) with the project.
- `stageDriver`: how a change of the show moves a stage, shared by the audience window and the console's
  preview.
- `startPage`: what a one-file export opens on: the title, what the file holds, a saved place and "Start again",
  the console and the slides, the keys, and every source as an APA list with the scenes citing it.
- `exportHtml(project, template, { notes })`: the one-file HTML. The project goes into the page's JSON slot
  (every `<` escaped, so nothing in it can close the element), with or without the presenter's words. The
  report gives the size, the images and the fonts not carried, and warns past 20 MB. Pure: the same project
  and template give the same bytes.
- `build/template.ts` (`@loopweft/player/build`, Node only): `playerTemplate()` builds the page with Vite in
  memory and inlines its script, styles and fonts into one HTML file with an empty slot. The command line
  (`loopweft export --html`) and the tests use it.
- The page (`page/`): `npm run player` serves it on this machine with the polycrisis example:
  - with no view: the start page;
  - `?view=presenter`: the console;
  - `?view=audience`: the slides, kept in step with other windows (`&rehearse`: alone, with notes on N).

See [presenting and sharing](../../docs/present.md).
