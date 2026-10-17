// @loopweft/motion: Loopweft's own animation engine (MIT). Timelines of tweens and calls on one playhead,
// GSAP-style eases, and clocks that run live or step exact frames for video. No dependencies.
export { type Clock, FrameClock, IntervalClock, ManualClock } from './clock.ts';
export { cubicBezier, type Ease, type EaseSpec, ease } from './ease.ts';
export { Motion, type MotionOptions } from './motion.ts';
export { type Channel, channels, type Props, round, type Value } from './props.ts';
export { land, Timeline, type TimelineOptions, Tween, type TweenOptions } from './timeline.ts';
