# Templates

A new map can start blank, from one of the eight classic system archetypes, or from the polycrisis example.
`loopweft new <file> --template <id>` and the Studio's New dialog offer the same templates.

Each archetype template is a structure, not a finished map: the causal loop diagram that Kim and Anderson
draw for the archetype, with the generic variable names they give it, its links and their signs, its delays
and its loops. Rename the variables for the system you are mapping, and cite your own sources for the
links. A template's variables have no definitions and its links cite nothing, so Loopweft flags every link
as uncited until you do; its named loops cite the book's figure for their structure.

Source: Kim, D. H., & Anderson, V. (1998). *Systems archetype basics: From story to structure*. Pegasus
Communications.

| Id | Archetype | Loops | Figure |
|---|---|---|---|
| `blank` | A blank map | | |
| `fixes-that-fail` | Fixes that fail | B1 the fix reduces the symptom; R2 its unintended consequence (after a delay) revives it | 2.3 |
| `shifting-the-burden` | Shifting the burden | B1 the symptomatic solution; B2 the fundamental solution (with a delay); R3 the side-effect erodes the fundamental solution | 3.2 |
| `limits-to-growth` | Limits to growth (the book's "Limits to success") | R1 efforts and performance; B2 the limiting action, which a constraint drives | 4.2 |
| `tragedy-of-the-commons` | Tragedy of the commons | R1, R2 each user gains from more activity; R3, R4 each steps up as the gain per activity falls; B5, B6 the falling gain (after a delay) cuts their net gains | 9.2 |
| `escalation` | Escalation | B1, B2 each party acts to improve its position relative to the other | 8.4 |
| `success-to-the-successful` | Success to the successful | R1 resources to A bring A success; R2 less for B favours A | 7.2 |
| `eroding-goals` | Eroding goals (the book's "Drifting goals") | B1 corrective action (with a delay) closes the gap; B2 lowering the goal closes it | 5.2 |
| `growth-and-underinvestment` | Growth and underinvestment | R1 growth efforts and demand; B2 the limiting factor slows demand; B3 investing in capacity (with delays) eases the limit | 6.2 |
| `polycrisis` | The polycrisis example ([examples/](../examples/README.md)) | 18 named loops | |

In Tragedy of the commons, the book adds two loops (R3, R4) to the archetype as it is usually drawn; the
template keeps them, as the book's figure has them.
