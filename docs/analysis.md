# Loops, ripples, paths and connections

The Studio's Loops, Ripple, Paths and Connected panels, and `loopweft loops list`, `ripple`, `paths` and
`connected` on the command line, read a map's structure: its variables, its links and their signs. They
never use amounts, rates or timing, because a causal map has none. What they find is a property of the map
as drawn, not a forecast.

## Loops

A feedback loop is a path of links that comes back to where it started without passing a variable twice.

- **Reinforcing (R)**: an even number of − links. A change that goes round comes back the same way.
- **Balancing (B)**: an odd number of − links. A change that goes round comes back the other way.
- **Unknown (?)**: a link of the loop has an unknown sign (`?`), so the loop's polarity is unknown too.

The search finds every loop once (Johnson's algorithm), lists up to 1,000 of them, shortest first, and
counts all of them up to ten million; past that the count is a lower bound ("at least"). A smaller *up to
how many links* narrows the search. Links of optional types (for example documented side-effects) are left
out unless they are counted too, as they are in the map's structure. The same map always gives the same
loops: the search reads no clock and stops only at the count limit or when stopped.

A named loop is one the map's author has chosen to name: what a story shows and cites. Its polarity always
follows its links' signs and is never stored.

## Ripples

A ripple asks: if this variable rises (or falls), which way is each variable it affects pushed? The
change goes out link by link, step by step:

- along a **+** link the effect moves the same way as the cause; along a **−** link, the opposite way;
- a variable takes the direction of the first push to reach it (▲ rises, ▼ falls);
- where opposing pushes arrive at the same step, it is **± mixed**: the signs alone cannot tell which wins,
  so the ripple goes no further from there;
- a link of **unknown sign** (`?`) is not crossed;
- links of **optional types** are left out unless followed too.

The ripple also names what it cannot settle by signs alone:

- links that bring the change **back to the start**, the same way (a reinforcing loop) or the other way (a
  balancing loop);
- variables **pushed the other way later**, round a loop or by a longer way. The first push decides the
  direction shown; the later one is a reason to look closer, since its strength and timing are not on the
  map.

A conditional link (drawn dashed) is followed as if its condition holds, and a delayed link as if the delay
has passed.

`loopweft ripple` tells the ripple by the variables' names, each way in words beside its mark (`▲ Deaths:
rising`); its `--json` data names them by id. Stopped by `--max-steps`, it says so (`capped`) whenever there
is more past the cap: a variable to reach, feedback to the start, or a push the other way.

The ripple follows the rule of the polycrisis deck's own ripples, whose ▲/▼ badges were carried along the
lit links by their signs. A ripple is reached by the same steps every time for the same map.

### A ripple on the map, and in the story

While the Studio's Ripple panel shows a ripple, the canvas draws it: the start, the variables it reaches and
the links it crosses lit, each variable marked ▲ ▼ ±, the rest faded. It is only a view: nothing is saved.

**Make a story step from it** adds a step at the end of a scene (or of a new scene) that shows the ripple:
the start lit most (active), what the change reaches and the links it crosses lit (focus), the rest faded
(variables dim, links ghost), the marks, and pulses along it hop by hop, in order, with the scene's caption
when its other steps show one. It is one edit (one Undo), and the Studio then shows the step. On the command
line, `story step add <file> <scene> --label <label> --ripple <variable>=up|down` does the same, and
`story step set <file> <step> --ripple …` makes an existing step show one (its camera, labels and the rest
stay); `--ripple-optional` follows links of optional types too. The step shows directions only, as the ripple
does: no amounts and no timing, and it stops where the ripple stops.

## Paths

A path from one variable to another follows links in their direction without passing a variable twice. It
shows how a change in the first can reach the second.

- Each path has a **sign**: **+** when it has an even number of − links (a rise at the start pushes the end
  up), **−** when the number is odd (it pushes the end down), and **?** when a link of it has an unknown sign.
- Paths are listed **shortest first**, then in the order of the map's links; up to 100 are listed and all are
  counted up to 100,000, past which the count is a lower bound ("at least"). *Up to how many links* narrows
  the search.
- When paths of **both signs** lead from one variable to the other, the map alone cannot tell which way a
  change at the start moves the end: that depends on the strength and timing of each, which the map does not
  hold.
- Links of optional types are left out unless followed too, as in the loop counts. A path from a variable
  back to itself is a loop: the loop search finds those.

The search is the same every time for the same map: it reads no clock and stops only at the count limit (or
a fixed budget of steps on a very large map).

## Most-connected variables

For each variable: the links into it and out of it, the other variables it links with, and the named loops
it is part of. The list puts the most links first.

**Connected does not mean leverage.** A variable with many links is not, for that reason, a good place to
intervene: how much a change there matters depends on what a count of links cannot show, such as how strong
each influence is, its delays, which loops dominate, and what can actually be changed. The Studio and the
command line say so wherever they show the list.
