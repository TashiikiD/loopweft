# Exporting

Loopweft exports a project in these forms:
- **One HTML file**, to present and share: see [presenting and sharing](present.md).
- **Pictures (PNG)** of a step, of every step, or of the whole map (below).
- **Drawings (SVG)** of the same: shapes and text that stay sharp at any size and can be edited (below).
- **The slides, the speaker notes and the references** as PDFs (below).
- **Video (MP4 or WebM)** of the story, a scene or steps, as the talk plays them, and **GIF** loops of a scene
  or some steps (below).

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
  leaves them out (a video shows them).
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

## Drawings (SVG)

An SVG is a drawing rather than pixels:
- it stays sharp at any size (a poster, a printed page);
- it opens in browsers, PowerPoint, Word, Inkscape and Illustrator;
- its shapes and text can be edited in Inkscape and Illustrator, and in PowerPoint once made for it (see
  [For PowerPoint and Word](#for-powerpoint-and-word)): move a label, change a word, recolour a link. In Word,
  keep it as a picture.

In the Studio: **Export**, then **Pictures (PNG or SVG)**, and choose SVG. On the command line:

```bash
loopweft export talk.loopweft --svg --step S04.2a
```

The choices are those of PNG (one step, every step, the whole map, trimmed or not, categories in words), except
the size: a drawing has no size in pixels. Its nominal size is the stage's, 1920 × 1080 (or the trimmed map's).
Files are named as pictures are, ending in `.svg`; every step goes into `<title>-steps-svg.zip` (Studio) or a
new folder `<project>-steps-svg/` (command line).

How it is made: the drawing is read from the stage the page has laid out, the same stage the PNG draws.
- Every box, line of text, link and variable is placed where the page placed it.
- The map, already SVG, is copied with its colours written out.
- Gradients, glows and shadows become SVG gradients and filters.
- Text stays text: one line of SVG text for each line on the stage, in the same font, size and spacing.

So the drawing, drawn again by a browser, matches the PNG of the same step: a test checks every step of the
example on Windows, macOS and Linux. The largest difference is in the Richards figure (a photograph, resampled a
little differently).

Every drawing says what to know about it: the Studio lists it under the export, and the command line prints
it as `note:` lines and in `--json` as `notes`. What it can say:
- **Text is real text, in Inter and Fraunces**, embedded for browsers. PowerPoint, Word and Inkscape use the
  fonts installed on the computer: without Inter and Fraunces (both free), they show another font, and lines
  may come out a little longer or shorter.
- **Glows and soft shadows are SVG filters.** Browsers and Inkscape draw them; PowerPoint and Word leave them
  out. The map then has no glow, and labels lose the soft dark edge that keeps them clear of the links.
- **The soft top and bottom edges of the backdrop behind a column of cards are an SVG mask**, which PowerPoint
  and Word leave out; there the backdrop ends sharply.
- **Made for PowerPoint and Word** and **Round shading that does not fade out to clear … is left out**: only in
  a drawing made for PowerPoint and Word (below).
- **Drawn approximately: …** names anything the drawing could not carry across exactly, and what it did
  instead. The example has none. A project whose stage shows something Loopweft's own stylesheet never makes
  (another kind of gradient, a turned box) would be told here.

Every drawing is the same file each time it is made from the same project on the same computer, in the Studio
and on the command line alike: its numbers are written to two decimals and its parts are numbered in drawing
order. Another system's browser can lay a line of text out a fraction of a pixel differently, so a drawing made
there may differ in a few numbers (of the example's drawings checked on GitHub's machines, Windows and Linux
gave the same file for some and not for others). It names
Loopweft only in its properties (`<metadata>`), and its title is the project's title and the step's key.

### For PowerPoint and Word

PowerPoint and Word draw an SVG well as a picture. Both can also turn it into their own shapes (select it, then
**Graphics Format › Convert to Shape**), so that each piece can be moved and recoloured there. That conversion
keeps flat shapes, see-through colour, straight gradients and, in PowerPoint, the text. It does not keep round
(radial) gradients, which become solid shapes, nor the opacity of a group (tested in Microsoft 365, October
2026).

- **In PowerPoint**, Convert to Shape ruins the plain drawing: the stage's backdrop becomes a flat bright colour,
  each variable's halo and each group's glow a solid disc, and the faded part of the map comes back at full
  strength. Make the drawing **For PowerPoint and Word** instead (a switch under SVG in the Studio, `--for-office`
  on the command line), and Convert to Shape keeps it: its glows are rings of flat see-through colour (up to ten
  for a strong glow, fewer for a faint one, each adding about 4% at most, matching the glow at the middle of each
  ring), each faded part carries its own opacity, and the darkened edges of the stage's backdrop, which rings
  cannot draw, are left out (the backdrop is its plain colour there). A glow's rings are cut where a variable's
  glyph lies over them, and a response's ring is drawn around its dot, so that neither shows through. As a
  picture, it looks as the plain drawing does but for those edges, and where other shapes overlap in a faded part
  of the map: links that cross, or meet at a variable, and a link's line under its arrowhead or end bar. Each
  carries the faded part's opacity on its own, so where two overlap they show a little brighter than under one
  opacity (in the example, at most about 30 levels of 255, in a few small places).
- **In Word, keep the drawing as a picture.** Word's Convert to Shape breaks the text whatever the drawing: in a
  drawing the size of a slide, the text keeps its full size while the shapes shrink to the page, so lines wrap
  and pile up; in one the size of the page, the text lands in place but is drawn dark, under the background.

```bash
loopweft export talk.loopweft --svg --step S04.2a --for-office
```

Its notes say so. The fonts note holds here too: without Inter and Fraunces installed, PowerPoint sets the text in
other fonts once converted, so a label may run a little wider than its place.

## The slides (PDF)

One 16:9 page per step, in story order: a backup for the day (the talk goes on from any PDF reader, one page per
key press) and a handout. In the Studio: **Export**, **PDF documents**, then **Slides**. On the command line:

```bash
loopweft export talk.loopweft --pdf slides
```

- Each page is the step as the audience sees it once its motion is over, drawn as a PNG picture is (by the
  browser, on the command line the Chrome or Edge on this computer), then kept as a JPEG of high quality (95%).
  JPEG keeps the file a size that can be emailed: the example's 70 slides take about 15 MB, against 113 MB as
  pictures.
- Nothing is drawn on the slides: the reader's page number is the slide's number, as the speaker notes' marks
  count them.
- A bookmark opens each scene at its first slide, named as its caption names it ("05 · Feedback: the widening
  lens").
- Pages are 16:9, the stage's own shape, whatever the paper (`--paper` is for the notes and references).
- **Name categories in words** (`--category-words`) draws the slides as the C key shows them.
- Every step is drawn, so a story of 70 steps takes about 20 seconds; the Studio shows its progress and can
  cancel.
- Written to `<project>-slides.pdf`. As for the pictures, the same project gives the same file on the same
  computer and browser.

## The speaker notes and the references (PDF)

Two documents to print or hand out, on Letter (the default) or A4 paper. In the Studio: **Export**, then **PDF
documents**. On the command line:

```bash
loopweft export talk.loopweft --pdf notes
loopweft export talk.loopweft --pdf references --paper a4
```

They are written to `<project>-speaker-notes.pdf` and `<project>-references.pdf` (`-o` names another file).
As for every export, nothing is replaced without `--force`.

**The speaker notes**, as the polycrisis talk's notes were:
- The first page: the title, the author and course where the project gives them, and how to read the slide
  marks.
- Each scene on a page of its own:
  - its number and title (as its caption shows them) and its headline;
  - the slides it covers, its target time and when it starts in the talk (or "untimed");
  - its steps, each with its slide number, its key and label, its cue and when it is due;
  - the speaker notes, formatted as written (lists, bold, italics, links);
  - the script, with a mark such as **▶ 23** wherever a key press brings up slide 23, the last bringing up the
    next scene's first slide;
  - the sources it draws on, by their short names.
- A scene shows only what the project holds: no heading for notes or a script it does not have.

Slide 23 is the 23rd step of the story: the slides PDF has one page per step, in the same order.

**The references:**
- every source, as an APA 7 list: alphabetical, with a hanging indent, titles in italics, and DOIs and web
  addresses as links;
- under each source, what the map draws from it (if the project says), the scenes that cite it (or "Not cited
  in the story."), and its licence;
- a supplement sits under its work;
- the heading gives the title, the author and course where set, and the project's description;
- at the end, every image the story shows, with its caption, its credit as the project gives it (or that it
  gives none), where it appears and what it shows. For the example: the Richards et al. (2021) figure, with
  its CC BY 4.0 credit.

How they are made:
- by Loopweft itself, in TypeScript (pdf-lib), in the Studio's page or on the command line alike, with no
  browser;
- text is set in Fraunces for reading and Inter for headings, embedded with only the letters each PDF uses;
- arrows and signs neither font has (→, ↔, ≈) come from Noto Sans Math, also free (OFL);
- a character no font has is named in the export's report, never dropped: it shows as an empty box.

Each PDF has a bookmark for each scene (the speaker notes), page numbers in its footer, the project's title
in its properties, and Loopweft as the program that made it. Its date is the project's own date of last save,
if it has one, never the time of export. So the same project always gives the same file, byte for byte, on any
computer: a test checks the example's.

## Video (MP4 or WebM)

The story as the talk plays it, with all its motion: links traced, pulses travelling, the camera moving, and the
soft pulses wandering a held step. In the Studio: **Export**, then **Video**. On the command line:

```bash
loopweft export talk.loopweft --mp4
loopweft export talk.loopweft --mp4 --scene S04 --talk-timing
loopweft export talk.loopweft --webm --from S04.2a --to S04.6 --height 720
```

| What | Studio | Command line | File |
|---|---|---|---|
| The whole story | The whole story | (the default) | `<project>-story.mp4` |
| One scene | One scene, then the scene | `--scene S04` (its id or title) | `<project>-S04.mp4` |
| Steps | Steps, from one to another | `--from S04.2a --to S04.6` (the same step twice for one) | `<project>-S04.2a-to-S04.6.mp4` |

How long each step lasts, one of:
- **Each step's motion, then a hold** (the default): the step plays until its motion is over, then holds for
  3 seconds (`--hold <seconds>`, 0 to 60), its soft pulses wandering if it has them. The example's story comes
  to 6:42.
- **The talk's own timing** (`--talk-timing`): each step until the next is due, as the Story workspace's
  Play plays a scene. A step with no time it is due holds 4 seconds; a scene's last step holds until the scene's
  target length. A step whose motion is not over when the next is due is cut short, as a presenter's key press
  would. The example's story comes to 14:04, its target.

| Option | Studio | Command line |
|---|---|---|
| Size | 1920 × 1080 or 1280 × 720 | `--height 1080` (the default) or `--height 720` |
| Frames a second | 30 or 60 | `--fps 30` (the default) or `--fps 60` |
| Name each shown variable's category in words | Name categories in words | `--category-words` |
| WebM instead of MP4 | WebM (VP9) | `--webm` instead of `--mp4` |

How it is made:
- The story is played on a clock that moves one frame at a time, exactly 1/30 (or 1/60) of a second, however
  long a frame takes to draw. So nothing is ever dropped or doubled, and a slow computer makes the same video,
  only more slowly.
- Each frame is drawn as a picture is (above), then encoded by the browser: MP4 is H.264, which plays everywhere
  (PowerPoint, Keynote, the Windows and Mac players, phones, the web); WebM is VP9, for a browser that cannot
  make MP4. There is no sound.
- A video starts as the talk arrives at its first step: from the step before, shown settled (for the story's
  first step, from an empty stage), as the presenter's replay of a step does. The motion into the first step is
  in the video.
- **The frames are the same every time.** Loopweft puts each frame in the form an encoder takes (BT.709 colours,
  as video uses) itself, since a browser's own conversion can vary from one run to the next, and uses the
  browser's software encoder where it has one (Chrome and Edge do).
- **Whether the file is the same, byte for byte, depends on the browser's encoder.** WebM (VP9) came out the
  same every time on every computer tried. MP4 (H.264) did on a Windows laptop and on GitHub's Mac; on GitHub's
  Linux and Windows servers, Chrome's H.264 encoder gives slightly different bytes each time, from the very same
  frames, which nobody watching could tell apart. Where the same bytes matter, export WebM. Where only the
  graphics card can encode, the export says so, as two exports may then differ slightly.
- Loopweft writes the MP4 and WebM files itself. Their only dates are zero, and they name the project's title
  (and author, in an MP4) and Loopweft as the program that made them.
- A key frame every 2 seconds, so a player can jump anywhere quickly.

How long it takes: the frames where something moves are drawn one by one; a held step with nothing moving is
the same frame again, which is quick. On a laptop, at 1920 × 1080 and 30 frames a second, the example's whole
story took about 8 minutes with 3-second holds (6:42, 75 MB) and 11 minutes in the talk's timing (14:04, 91 MB). The Studio shows how far it has got and
can cancel; the command line shows it on its line in a terminal.

## GIF

A short loop of a scene or some steps, played as a video is (above), that shows wherever an image does: a chat,
a web page, a slide, an email. In the Studio: **Export**, **Video**, then **GIF**. On the command line:

```bash
loopweft export talk.loopweft --gif --scene S04
loopweft export talk.loopweft --gif --from S04.2a --to S04.2d --hold 1
```

- **960 × 540 at 15 frames a second**, looping for ever. The timing (each step's motion then a hold, or the
  talk's own) and categories in words are chosen as for a video; the size and rate are not.
- **A scene or some steps, not the whole story**: a whole story would make a file far too large to share (an MP4
  of it is the way).
- **256 colours a frame**, as GIF allows: each frame has its own, so colours stay true, but the soft glows and
  the backdrop's gradient show faint bands.
- **Small for what it shows:** each frame holds only the part of the screen that changed since the frame
  before, and a held step where nothing moves is one frame shown for as long as it is held. Two steps of the
  example with 1-second holds come to about 0.3 MB; its scene 4 (nine steps, 55 seconds with 3-second holds) to
  about 9 MB.
- **Past 20 MB, the export warns**: many apps, chats and email services refuse a GIF that large, or play it
  slowly. The GIF is still made; fewer steps make a smaller one.
- GIF counts time in hundredths of a second: each frame lasts 6 or 7 hundredths so that the whole lasts exactly
  as long as the video would. The same project gives the same file, byte for byte, on the same computer.
- Written to `<project>-<scene>.gif` or `<project>-<step>-to-<step>.gif`. Loopweft writes it with gifenc
  (MIT), with no date in it.

## Sizes and names, for reference

- Pictures are 1920 × 1080 pixels, the stage's own size, or 3840 × 2160; a trimmed map is smaller. Video is
  1920 × 1080 or 1280 × 720; a GIF is 960 × 540.
- A file is named by the step's key, the scene's id and the step's id: `S04.2a`. Those are the names the Story
  workspace and the command line use. In a folder, pictures sort by those names, which for the example is story
  order. A scene whose id Windows keeps for a device (`CON`, `NUL`, `COM1`…) gets a `_` in front.
- A zip of every step stores the pictures as they are (a PNG is compressed already). Every entry is dated
  1 January 1980, so the same pictures always make the same zip.
