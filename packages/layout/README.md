# @loopweft/layout

Where things go on the map. Everything here is deterministic: the same project (and seed) always gives the
same positions, bends and label sides.

- **Automatic layouts** (`autoLayout`), all keeping pinned variables where they are:
  - `constellation`: each category a cluster on an ellipse round the centre, inside a soft halo, the
    best-connected variables nearest its heart (the polycrisis look);
  - `force`: DataViz's seeded force layout (d3-force, clustering by category, overlap removal and crossing
    reduction);
  - `flow`: causes on the left, effects on the right, feedback set aside, layers ordered by barycentre.
- **Link curves** (`mapGeometry`, `chooseBends`): the deck's curvature choice (keep curves off other
  variables, part two-way pairs), then DataViz's route diagnostics re-bend the few links that cross or share
  corridors most, when that is a clear improvement. Bends set by hand are kept.
- **Label placement** (`placeLabels`): the deck's eight-spot search around each variable, avoiding lit links,
  variables, other labels and reserved regions.
- **Camera maths** (`fitCamera`, `project`): frames on the 1920 × 1080 stage, and a whole-map view fitted to
  the map.

Copied code keeps a `Source:` header: `geometry.ts`, `labels.ts` and `camera.ts` from the polycrisis deck;
`force.ts`, `route-diagnostics.ts` and `route-geometry.ts` from DataViz (commit `efcdbe2`), which ported
them from cld-generator.

Text measurement from the real fonts (for exports without a browser) comes later; in the browser, the
renderer measures labels as drawn.
