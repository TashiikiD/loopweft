# Examples

## `polycrisis.loopweft`

The map and story of *Global Polycrisis: the connections that change everything*, a 14-minute talk. It is a
qualitative, evidence-informed synthesis of nine published studies and two of their supplements (with three
institutional web pages for the history of the word), not a calibrated causal model.

| Part | What it holds |
|---|---|
| Map | 41 variables in 7 domains (categories with their colours), playing 4 roles (stress, trigger, crisis, response), and 132 signed links |
| Links | Their mechanism (common stress, cascade, feedback, intervention, response, side-effect), whether they are conditional, their evidence level (explicit, synthesis, illustrative), a rationale, and 1 to 4 citations with page numbers |
| Loops | 18 named loops, with cautions and citations; the map holds 5,636,759 loops in all (342 of up to six links), leaving the two documented side-effects out |
| Sources | 14 sources with full APA 7 references, DOIs, licences and what the map draws from each |
| Layout | The talk's hand-tuned positions, short map labels, domain halos and one link bend |
| Story | 11 scenes and 70 steps, each with its map state, overlays, a cue for the presenter and speaker notes |

### Where it comes from

It is converted from the talk's own files, which stay private, by
`packages/model/src/importers/polycrisis.ts`. The converter never edits the talk; it checks that the
result is valid, and stops if anything in the talk no longer matches its rules. To rebuild the file:

```bash
npm run convert:polycrisis -- --deck <folder of the talk>
```

The same talk always gives the same bytes. The tests rebuild it and compare, wherever the talk is
available (see [CONTRIBUTING.md](../CONTRIBUTING.md#the-polycrisis-example)).

### What was cleaned up

The talk was one person's presentation; the example is for anyone. So:

- **Left out:** the fake title page that opened the talk (build S00.1), the full scripts and the closing
  line of each scene, and the speaker notes about the fake page and the presenter's introduction.
- **Title page:** the title and subtitle stay; the presenter's name, programme, course and university do not.
- **Reworded:** three step labels and cues that addressed the room or spoke for the authors ("our map"
  became "the map"; "our reading" became "an interpretive reading, not from the source"), and four speaker
  notes that spoke to the talk's own audience ("this room knows each one", "the class knows the notation",
  "speak to the room", "without deflating the room"), so they suit any audience.
- **Renumbered:** with the fake page gone, the title page is step 1 of its scene.

### What stays in the talk

The talk's one-off visuals have no Loopweft equivalent yet, so the steps that showed them keep their map
state and captions but not the visual: the timeline of the word (scene 2), the "why now" panel (scene 3),
the stability landscape (scenes 3 and 10), the conditional-transmission schematic (scene 4), the loop
counter and a cameo of another study's diagram (scene 5), and the ring of Anthropocene traps (scene 6).

Also not carried over: the four named pathways and the Fig. 9 stages (the steps that use them keep their lit
links), the trap reference layer, the authoring rules, revision notes, node scale (every node was
"global"), and the file names of the source PDFs.

### Conventions worth knowing

- Ids come from the talk: variables such as `food_insecurity`, links `E001`–`E133` (`E048` was split in
  two), loops `R1`–`R16`, `B1`, `B2`, and source tags such as `L` (Lawrence et al., 2024).
- The role with id `intervention` is named "Response", as in the talk's legend.
- The two documented side-effects (`E128`, `E129`) are of an optional link type: hidden unless a step
  lists them, and left out of automatic loop counts.
