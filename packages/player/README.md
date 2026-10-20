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

Still to come in Phase 5: the audience window, the presenter console, rehearsal notes and the one-file HTML.
