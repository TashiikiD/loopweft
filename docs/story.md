# Telling a story

A Loopweft story walks an audience through a map, one keypress at a time. It is a list of **scenes**, each
a list of **steps**. Every step states the whole picture: what the map shows, where the camera is, and
what is drawn over it. Loopweft animates the change from one step to the next by itself, so a story is set
up, never keyframed. [The format specification](format.md#10-story) says what each field means; this page
says how the pieces work together and how they are checked.

## Scenes and steps

- A **scene** has a title, an optional headline (its one-line message, shown in the caption band), a target
  time, speaker notes, a script and the sources it draws on beyond those its steps light.
- A **step** has a label (for the presenter), an optional cue (what happens on it) and an optional time it
  is due (`at`, in seconds into the scene), its map state and its overlays.
- A step is named by its scene and its own id: `S05.3` is step `3` of scene `S05`. New scenes get the next
  free `S<n>` (padded as the others are: after `S10` comes `S11`), new steps the next whole number in their
  scene. Ids never change when a scene or step is renamed or moved, so a reference stays good; a step moved
  to a scene where its id is taken gets that scene's next free id, and Loopweft says so.
- Removing a scene that still has steps needs *cascade*, which removes them too.
- A copy of a step keeps everything it shows and gets a new label, which you give: it is a step of its own.

## What a step shows

Each step's map state lists what stands out. Variables and links each have a **base** level (everything
not listed) and lists for the levels from `hidden` to `active`; **lit** means focus or active. Putting an
element at a level takes it off any other list; putting it "back to the base" takes it off every list.

On top of the levels a step can mark:

- **trends**: ▲ up, ▼ down or ± mixed on variables. *Spread by sign* sets them for you: choose a variable
  and a direction, and the change spreads along the links the step lights (at Focus or Active), as the ripple
  spreads it ([loops and ripples](analysis.md#ripples)): a + link carries it the same way, a − link the other
  way, and where opposing pushes arrive together the variable is ± and the spread stops. On a step that lights
  no links it follows the whole map's links instead (leaving out optional types, as the ripple does) and
  lights the start, what it reaches and the links it crosses, so the marks show. It says which it did, and
  why when it reaches nothing. Pushes that come back the other way later (round a balancing loop) are named:
  the story check flags those on lit links, so on the whole map, where the spread lights only the links it
  crosses, it says which are not lit (light them with Show to have them checked);
- **loop badges** (R or B, worked out from the signs) and **loop names** beside them. A name needs its
  badge: showing a name shows the badge, hiding the badge hides the name;
- **pulses**: glows that travel along links, hop after hop (each hop leaves when the one before arrives),
  added one hop at a time, joined to the last hop, or sent round a named loop, one link after another;
- **reveal**: how newly shown things arrive (traced in from their source, blooming out ring by ring, or in
  an exact order);
- **ambient** pulses that keep wandering while a step is held, such as a title page or a close;
- the **camera**: the variables to frame (left out: the whole map, or the home view when the layout has
  one), where on the stage they go, and a zoom limit. The camera is set by what it frames, never by a
  position, so it follows the map when the layout changes.

## Overlays

Overlays draw over the map in list order, later ones on top: the scene's caption band, a title page,
statements, cards, the legend and images. Each step lists its own, so every step is complete on its own;
an unchanged overlay stays put from one step to the next. A step shows the caption at most once. The caption
numbers its scene: the scenes that show a caption are counted from 1, so a title scene without one takes no
number and the first captioned scene is 01; the presenter's console uses the same numbers. An image
overlay shows an image embedded in the project (PNG, JPEG, GIF, WebP or SVG, read from the file's bytes,
never its name; a cut-off or incomplete file is refused) and needs a description (`alt`) for people who
cannot see it. Removing an image that steps
still show needs *cascade*, which removes those overlays too.

## Notes and script

Speaker notes are Markdown, for the presenter only. The script is the full text, with `[>]` key marks: the
n-th mark brings up step n + 1, and one more mark after the closing line moves on to the next scene (the
last scene has none). So a scene of four steps has four marks, three if it is the last.

## Checks

A story that breaks the map's rules is still saved, but every problem is listed as a warning until it is
fixed ([the full list](format.md#14-checking-a-project)). The story checks:

| Check | Flags |
|---|---|
| Trends against the signs | A ▲/▼ that the signs of the lit links contradict (± is left open) |
| Hidden things in use | A pulse on a link that is not visible; a camera, reveal or ambient start on a hidden variable; a loop badge whose links are hidden; a trend on a barely visible variable |
| Pulse order | A pulse that leaves a variable before any earlier pulse reaches it |
| Names and lists | A loop name without its badge; an id listed at two levels |
| Script and timing | Key marks that do not match the steps; a step due before the one before it, or after the scene's target time |
| Loose ends | A scene with no steps; an image no step shows |

## Editing a story

Every edit is one of `@loopweft/model`'s operations, the same in the Studio and on the command line:

| Operation | Does |
|---|---|
| `addScene`, `setScene`, `removeScene`, `moveScene` | Scenes |
| `addStep`, `setStep`, `removeStep`, `moveStep`, `copyStep` | Steps |
| `setStepLevel`, `setStepBase`, `setStepTrend`, `spreadTrend`, `setStepRipple`, `setStepLoops`, `addPulseHop`, `pulseRoundLoop`, `setStepMap` | What a step's map shows |
| `addRippleStep` | A new step that shows a ripple |
| `addOverlay`, `setOverlay`, `removeOverlay`, `moveOverlay` | A step's overlays (counted from 0) |
| `addAsset`, `setAsset`, `removeAsset` | Embedded images |

## In the Studio

The Story workspace has the outline of scenes and steps on the left, the stage in the middle (the story as
the audience will see it, drawn by the same renderer as the audience window) and a panel on the right.

- **Outline:** choose a step to show and edit it. Add a scene; add a step to a scene (a copy of the chosen
  step, so a story builds up step by step, or the whole map); copy, move and remove steps and scenes. A dot
  marks a step or scene the checks flag. As with an image's last overlay, removing steps also removes the
  images no other step shows (undo brings them back).
- **Record view:** choose a tool above the stage and click variables and links: *Show* puts them at a level
  or back to the base, *Trend* marks ▲ ▼ ±, *Spread* marks a what-if by sign along the lit links (or the
  whole map's, on a step that lights none), *Pulse*
  adds hops in the order clicked (Shift adds to the last hop), *Frame* chooses what the camera frames. While
  a tool is on, hidden things show as dashed outlines so they can be clicked back. From the keyboard, Tab
  reaches what the tool applies to on the stage (links for Pulse, variables for Trend, Spread and Frame, both
  for Show), and Enter or Space applies it.
- **Panels:** *Step* (label, cue, the time it is due, the sources it draws on), *Map* (everything the map
  shows, field by field, including loop badges, pulse timing, the camera, reveal and ambient pulses),
  *Overlays* (add, change, order, copy forward and remove; images with their description; citations with
  their pages, strength and note; replacing an image that other steps show asks first, as it changes it
  there too, and an image changed while the new file is read, or shown on more steps by then, is left as
  it is), *Scene* (title,
  headline, target time, sources), *Notes* (speaker notes and the script, cut at its key marks beside the
  steps they bring up) and *Checks* (the story's warnings, each a link to its step).
- **Preview:** play into the chosen step, or play the scene from it (each step when the next is due, or
  after four seconds when untimed; choosing another step, or any edit, stops it); skip to the end of the
  motion. With the stage focused, → and ← move
  through the story as a presenter would, R replays and S skips.

## On the command line

`loopweft story` runs the same operations ([the command line's reference](../packages/cli/README.md)):

```bash
loopweft story scene add pop.loopweft --title Growth --target 60
loopweft story step add pop.loopweft S1 --label "The loop" --base dim --link-base ghost --active L1,L2 --frame births,population --spread births=up --name R1 --pulse-loop R1
loopweft story overlay add pop.loopweft S1.1 statement --line "More people, more births." --style question --cite T:4
loopweft story show pop.loopweft S1.1
```
