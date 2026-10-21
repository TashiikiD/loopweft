# Exporting

Loopweft exports a project in these forms:
- **One HTML file**, to present and share: see [presenting and sharing](present.md).
- **Pictures (PNG)** of a step, of every step, or of the whole map (below).

SVG drawings, the three PDFs (slides, speaker notes, references) and video (MP4, WebM, GIF) follow in
Phase 6.

Every export is made on this computer. Nothing is uploaded, and nothing reaches the network.

## How pictures are drawn

A picture is drawn by the browser itself, from the same stage the audience window shows, so it looks as the
talk does:
- the same layout, fonts, colours and glows;
- the same captions, cards, statements, legend and images.

In the Studio, the drawing happens in a hidden part of the Export workspace, in the browser you are using.
On the command line, it happens in the Chrome or Edge already on the computer, run hidden (nothing is
downloaded). That browser:
- starts with a profile of its own, removed afterwards, so nothing touches your own browser;
- has its background traffic switched off: updates, sync and reports.

Both draw with the same page, so the Studio and the command line make the same pictures. Some fine print:
- **A step is drawn as it stands once its motion is over:** links traced, trends landed, the camera still.
  Pulses that travel along links, and the soft pulses that wander a held step, are motion, so a picture
  leaves them out (video will show them).
- **A step is reached through the story from its first step, as in a talk,** so it looks the same whether it
  is drawn alone, among every step, or (later) as a slide. The map keeps a little of what earlier steps did,
  such as the order its links are drawn in. A step drawn by jumping straight to it could differ by a shade
  where two faint links cross.
- **The same project gives the same picture.** Made again in the same browser on the same computer, a picture
  is the same file, byte for byte. Another computer, or another browser version, may smooth text or a glow a
  shade differently. The Studio and the command line on one computer can differ by one level (of 255) in a few
  pixels: the graphics card draws them, and remembers what it drew before.
- **Pictures match what the audience window shows.** A test checks the example's steps against the audience
  window at the same steps. The browser lays text out within a pixel of the window, never further. Every box
  (a card, a caption, a label) is drawn at the size the window gives it.
- **Only the fonts that come with Loopweft are inside the page that draws:** Inter and Fraunces. A theme that
  names another font shows it only if that font is installed on the computer that draws.

## Pictures (PNG)

In the Studio: **Export**, then **Pictures (PNG)**. On the command line:

```bash
loopweft export talk.loopweft --png --step S04.2a
```

| What | Studio | Command line | File |
|---|---|---|---|
| One step | One step, then the step | `--step S04.2a` | `<project>-S04.2a.png` |
| Every step | Every step (one .zip) | `--all-steps` | the Studio: `<title>-steps.zip`; the command line: a new folder `<project>-steps/`; one picture per step, named by its key (`S04.2a.png`) |
| The whole map | The whole map, without the story | `--map` | `<project>-map.png` |

The whole map is the map plainly, as a step that lists nothing shows it: every variable and link at normal
strength, labels in view, framed by the map's home view if it has one, with no captions or cards. A project
needs no story for it.

| Option | Studio | Command line |
|---|---|---|
| Size | 1920 × 1080 (the screen) or 3840 × 2160 (for print and posters) | `--scale 1` (the default) or `--scale 2` |
| Trim the whole map to the map and a margin of 40 stage pixels, not the whole 16:9 screen | Trim to the map | `--trim` (with `--map`) |
| Name each shown variable's category in words, as the C key does when presenting | Name categories in words | `--category-words` |

The picture uses the project's own theme. For a picture to print on paper, switch the theme to Light in the
Map workspace's Look panel, export, and switch it back (or undo).

Command line options shared by every export:

| Option | Does |
|---|---|
| `-o, --out <file>` | The file to write (for `--all-steps`, the folder) |
| `--force` | Replace a file of that name; for `--all-steps`, write into a folder that exists, replacing pictures of the same names (never the project itself, under any name) |
| `--json` | Report as one JSON document: every file written, with its size in pixels and bytes |

Without `--force`, an export never replaces anything:
- a single picture is put in place whole, as the one-file HTML is;
- every step goes into a new folder, which must not exist yet; each picture is added only where nothing has
  its name.

If an export fails part way, a folder it made goes again.

Everything that can be checked first is checked before the browser starts: the step names, the options and
the output names. Drawing needs Chrome or Edge. If neither is installed in the usual place, the export says
so; set `LOOPWEFT_CHROME` to the program file of another.

How long it takes: one picture takes a few seconds, most of it starting the browser. Every step of the
example (70 pictures) takes about half a minute and makes about 115 MB. A picture at 3840 × 2160 is about four
times the size of one at 1920 × 1080.

## Sizes and names, for reference

- Pictures are 1920 × 1080 pixels, the stage's own size, or 3840 × 2160; a trimmed map is smaller.
- A file is named by the step's key, the scene's id and the step's id: `S04.2a`. Those are the names the Story
  workspace and the command line use. In a folder, pictures sort by those names, which for the example is story
  order. A scene whose id Windows keeps for a device (`CON`, `NUL`, `COM1`…) gets a `_` in front.
- A zip of every step stores the pictures as they are (a PNG is compressed already). Every entry is dated
  1 January 1980, so the same pictures always make the same zip.
