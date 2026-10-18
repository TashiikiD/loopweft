# @loopweft/studio

The Loopweft Studio: one window with five workspaces. Phase 2 builds the **Map** workspace; Sources,
Story, Present and Export follow in later phases.

- Draw and edit a causal map: the canvas draws it with the renderer's own geometry, glyphs and theme
  colours, so it looks as it will when presented. Every change is one of `@loopweft/model`'s operations (the
  ones the `loopweft` command line runs), applied as one undoable step.
- Open and save `.loopweft` files. In Chrome and Edge, Save writes back to the file it came from (the File
  System Access API); other browsers download a copy. Nothing leaves the computer.
- While a map has unsaved changes, a copy is kept in the browser (IndexedDB) and offered back after a crash
  or a closed tab.

`npm run studio` serves it on this machine (port 5181; add `?example` to the address to start with the
polycrisis example). The published copy is at <https://tashiikid.github.io/loopweft/studio/>.

React and Mantine, as in DataViz's web app; a few files adapted from it say so in a `Source:` comment.
