# Loops and ripples

The Studio's Loops and Ripple panels, and `loopweft loops list` and `loopweft ripple` on the command line,
read a map's structure: its variables, its links and their signs. They never use amounts, rates or timing,
because a causal map has none. What they find is a property of the map as drawn, not a forecast.

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
