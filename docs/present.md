# Presenting and sharing a story

Loopweft presents a project's story the way the polycrisis talk was given:
- a **presenter console** on the laptop: notes, script, clocks and the evidence for what is on screen;
- an **audience window** on the projector: the slides and nothing else.

The two follow each other: a key pressed in either window, or a clicker, moves both.

A story can also be shared as **one HTML file**. The file opens by double-click from any folder, offline, with no
server. It holds the slides, the console (unless the notes are left out) and the list of sources.

## The one-file HTML

Make it in the Studio's **Export** workspace (One-file HTML, with a tick box for the notes), or from the
command line:

```bash
loopweft export talk.loopweft --html
```

| Option | Does |
|---|---|
| `-o, --out <file>` | The file to write (default: the project's name with `.html`) |
| `--no-notes` | Leave out the speaker notes, the script and every step's cue: a copy for the audience |
| `--force` | Replace the file if it exists |
| `--json` | Report as one JSON document: the size, the images and any warnings |

What the file holds:

- **A start page:**
  - the title, the description, the number of scenes and steps, and the total of the scenes' target times;
  - which of the presenter's words the copy holds;
  - the keys;
  - every source, as an APA list with the scenes that cite it and its licence.
- **The slides** (`?view=audience`), with rehearsal notes on N when opened from the start page.
- **The presenter console** (`?view=presenter`), when the notes are included.
- **Its own fonts and images:**
  - Loopweft's two fonts (Inter and Fraunces) are inside the file.
  - A theme that names another font shows it only where that font is installed, and the export says so.
  - Embedded images go in exactly as the project holds them: never shrunk or recompressed.

The export warns when the file passes 20 MB, since many email services refuse attachments of 20 to 25 MB, and
names the largest images. The same project always makes the same file, byte for byte.

The example exports to about 1.7 MB: the player and its fonts take about 1.2 MB, the project the rest (half of
it the one embedded figure).

## Presenting

1. Open the file, or the Studio's **Present** workspace. In the Studio, the presentation is the map as it is
   when the console opens, and the audience window gets the map from the console, so keep the Studio open.
2. If the start page shows **a saved place** from a rehearsal, click **Start again from the first step**.
   Never do this mid-talk: it sends the show back to the start.
3. Connect the projector and extend the desktop onto it: Windows key + P, then **Extend** (on a Mac: System
   Settings, Displays).
4. Open the **Presenter console** on the laptop's screen.
5. Click **Send to projector** in Chrome or Edge. The first time, the browser asks to place windows: allow it
   while rehearsing, not in front of the room. Elsewhere, click **Open audience window** and drag the window
   onto the projector.
6. Click the audience window once and press **F** for full screen.
7. Press **T** in the console when you start speaking. → or a clicker moves on.

### Before the day

- Rehearse once with the console's **Script** tab (F) if the story has a script: it marks every key press and
  lights the next one. The clock and pace show how each scene goes against its target.
- Plug the laptop in, and try the projector, the clicker (PageDown and PageUp) and full screen in the room
  if you can. If the animation stutters on that laptop or projector, press L for low-power mode.
- The first time you click **Send to projector**, Chrome or Edge asks whether the page may place windows:
  answer it during a rehearsal, not in front of the room.
- On the day, turn on Windows' **Do not disturb** (Focus) and close chat apps, so nothing pops up on the
  projector.
- Keep a copy of the one-file HTML on a USB stick: it runs on any computer with Chrome or Edge, offline.

### Keys

| Key | Does |
|---|---|
| → · Space · PgDn | Next step |
| ← · PgUp | The step before |
| Shift+→ / Shift+← | Next scene / start of the scene, then the scene before |
| A number, then Enter | The scene with that number (its caption's) |
| Home / End | First / last step |
| R | Replay this step |
| S | Skip: finish the animation now |
| P | Pause or resume the animation |
| B or . | Black out the audience window |
| L | Low-power mode, for a slow laptop or projector |
| C | Name each shown variable's category in words, so membership never rests on colour alone |
| G / F (console) | Speaker notes / script |
| ↑ / ↓ (console) | Scroll the notes |
| T / Shift+T (console) | Start or pause / reset the clock |
| F (audience) | Full screen (a double-click works too) |
| H (audience) | Hide the thin progress bar |
| N (audience) | Rehearsal notes, only when no console is connected |

F5, which some clickers send, is ignored, and holding a key never races through the steps.

### The console

- **The scene and step**, and **Now** and **Next** with each step's cue and due time.
- **The clocks:**
  - the total, started by hand (T);
  - this scene against its target;
  - the pace: on pace within 15 seconds, amber up to 45 seconds behind, red beyond;
  - the time left against the scenes' targets added up.
- **Notes** (the scene's speaker notes) and **Script** (the full script, each `[>]` key mark shown where the
  key is due, the next one lit).
- **A live copy of the audience's screen**, the scene's steps and a strip of scenes: click any to go there.
- **On screen now: its evidence:**
  - every lit link with its sign, type, conditions, mechanism and each citation with its pages;
  - the lit variables' citations, the loops badged, and what the overlays cite.

  Anything on screen can be traced to its source from here.
- **The scene's sources**, with their references and addresses.

### Rehearsing in one window

Open **Full-screen slides** from the file's start page, or **Rehearse** in the Studio's Present workspace (Esc
comes back). N shows notes over the slides:
- the step's cue, what comes next, and the scene's speaker notes;
- the presenter's clock and pace (T starts it).

The notes stay in that window. They refuse to open, and close themselves, while a presenter console is
connected, so they never reach a projector.

### If something goes wrong

- **A frozen or blank audience window:** click it and press Ctrl+R to reload it. It rejoins the console at the
  same step.
- **The console closes:** open it again from the start page, without clicking Start again. The audience window
  keeps its place meanwhile, and its keys still work.
- **Every window remembers its place** and the clock, in this browser, per presentation.
- **The console no longer finds the audience window** (it says "No audience window"): click **Open audience
  window** again. The same window opens again, at the same step, and the two find each other.

### How the windows find each other

Each change goes two ways: over the browser's channel for pages of one site (a BroadcastChannel), and
straight to the windows that opened each other. Every window passes a change on to the others it knows, so
two audience windows follow either of them.

Only the presentation's own windows can move it. A message from the channel comes from the same site or
folder. A message posted straight to a window is let in only from the same site, or, for a file opened from
disk (which has no site of its own), only when it carries the presentation's **join token**. The console makes
this random token for its browser tab and gives it to the audience window it opens, in that window's address
(`&join=…`). The token lasts as long as the tab, so a reloaded console or audience window still has it. It is
never written into a file.

### Browsers

The file runs in Chrome and Edge, which the tests open it in from disk on Windows, macOS and Linux.
- **Send to projector** needs Chrome or Edge. Elsewhere, drag the window.
- **Safari** (tested on GitHub's Mac, Safari 26, by `tools/safari.ts`):
  - Opened from disk, as a double-click opens it, it draws the start page, the slides and the console.
  - On the file served from a computer, its keys and the two windows kept in step were checked too.
  - Driven by a test, Safari refuses files on disk, so the keys and two windows *from disk* have not been
    checked there yet. A person with a Mac trying it is the next check.
- **Phones and tablets:** a tap on the right two thirds, or a swipe left, goes on; the left third, or a swipe
  right, goes back. This is not tested; Loopweft is made for laptops.
