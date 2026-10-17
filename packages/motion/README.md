# @loopweft/motion

Loopweft's own animation engine, under the MIT licence like the rest of Loopweft. It replaces GSAP, whose
standard licence does not allow no-code animation builders.

- **Timelines** place tweens, calls and other timelines at times on one playhead. Rendering depends only on
  the playhead, so playing live, stepping frame by frame and jumping to the end (`land`) leave the same
  final state.
- **Tweens** animate numbers on plain objects and on DOM elements: inline styles (`opacity`,
  `strokeDashoffset`), attributes (`attr: { r: 10 }`) and transforms (`x`, `y`, `scale`, `rotate`; CSS on
  HTML, the `transform` attribute on SVG). `fromTo` shows its starting state at once, so staggered entrances
  wait unseen.
- **Eases** use the GSAP names the polycrisis deck was written with (`power2.out`, `back.out(1.9)`,
  `sine.inOut`), plus CSS `cubic-bezier()`.
- **Motion** plays timelines from a clock and is the one place Pause and Skip reach. Standalone tweens take a
  property over from earlier ones still driving it.
- **Clocks:** `FrameClock` follows the display for live playback; `ManualClock` steps exact frames for tests
  and video export; `IntervalClock` drives headless captures, which get no animation frames.

```ts
import { FrameClock, Motion } from '@loopweft/motion';

const motion = new Motion(new FrameClock());
motion
  .timeline()
  .fromTo(card, { opacity: 0, y: 16 }, { opacity: 1, y: 0 }, { duration: 0.8, ease: 'power3.out', at: 0.2 })
  .call(() => card.classList.add('on'), 1);
```
