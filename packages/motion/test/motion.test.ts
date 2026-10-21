import { describe, expect, it } from 'vitest';
import { ManualClock, Motion, Timeline } from '../src/index.ts';

const setup = () => {
  const clock = new ManualClock();
  return { clock, motion: new Motion(clock) };
};

describe('the director', () => {
  it('plays timelines from the clock, frame by frame', () => {
    const { clock, motion } = setup();
    const box = { x: 0 };
    motion.timeline().to(box, { x: 10 }, { duration: 1, ease: 'none' });
    clock.advance(0.5);
    expect(box.x).toBeCloseTo(5, 6);
    clock.advance(1);
    expect(box.x).toBe(10);
    expect(motion.active).toBe(0);
  });

  it('gives exactly the same frames on every run', () => {
    const run = () => {
      const { clock, motion } = setup();
      const box = { x: 0, y: 0 };
      const values: number[] = [];
      motion
        .timeline()
        .to(box, { x: 100 }, { duration: 1.3, ease: 'power3.out' })
        .to(box, { y: 1 }, { at: 0.4 });
      for (let i = 0; i < 90; i++) {
        clock.tick(1 / 60);
        values.push(box.x, box.y);
      }
      return values;
    };
    expect(run()).toEqual(run());
  });

  it('pauses and resumes everything', () => {
    const { clock, motion } = setup();
    const box = { x: 0 };
    motion.to(box, { x: 10 }, { duration: 1, ease: 'none' });
    clock.advance(0.25);
    motion.setPaused(true);
    clock.advance(5);
    expect(box.x).toBeCloseTo(2.5, 6);
    motion.setPaused(false);
    clock.advance(0.25);
    expect(box.x).toBeCloseTo(5, 6);
  });

  it('skips: lands every playing timeline in its final state', () => {
    const { clock, motion } = setup();
    const a = { v: 0 };
    const b = { v: 0 };
    let fired = false;
    motion.to(a, { v: 1 }, { duration: 3 });
    motion
      .timeline()
      .to(b, { v: 2 }, { duration: 1, at: 4 })
      .call(() => {
        fired = true;
      }, 2);
    clock.advance(0.1);
    motion.landAll();
    expect([a.v, b.v, fired, motion.active]).toEqual([1, 2, true, 0]);
  });

  it('counts as busy only the timelines that are not idle', () => {
    const { clock, motion } = setup();
    const box = { x: 0 };
    motion.to(box, { x: 1 }, { duration: 1 });
    motion.delayedCall(0.5, () => {}, { idle: true });
    motion.play(new Timeline({ idle: true }).to(box, { x: 2 }, { duration: 3, at: 2 }));
    expect([motion.active, motion.busy]).toEqual([3, 1]);
    clock.advance(1);
    expect([motion.active, motion.busy]).toEqual([1, 0]);
  });

  it('calls a function after a delay, paused with everything else', () => {
    const { clock, motion } = setup();
    let called = 0;
    motion.delayedCall(1, () => called++);
    clock.advance(0.5);
    motion.setPaused(true);
    clock.advance(2);
    expect(called).toBe(0);
    motion.setPaused(false);
    clock.advance(0.6);
    expect(called).toBe(1);
  });

  it('lets a new standalone tween take a property over from an earlier one', () => {
    const { clock, motion } = setup();
    const el = { opacity: 0, x: 0 };
    motion.to(el, { opacity: 1, x: 100 }, { duration: 1, ease: 'none' });
    clock.advance(0.5);
    motion.to(el, { opacity: 0 }, { duration: 0.5, ease: 'none' });
    clock.advance(1);
    // Opacity follows the new tween; x keeps following the first.
    expect(el).toEqual({ opacity: 0, x: 100 });
  });

  it('sets values at once, stopping tweens that drive them', () => {
    const { clock, motion } = setup();
    const el = { opacity: 0 };
    motion.to(el, { opacity: 1 }, { duration: 1 });
    motion.set(el, { opacity: 0.3 });
    clock.advance(2);
    expect(el.opacity).toBe(0.3);
  });

  it('renders at most the frames a second it is given (low power)', () => {
    const { clock, motion } = setup();
    let renders = 0;
    motion.setMaxFps(30);
    motion.to({ x: 0 }, { x: 1 }, { duration: 10, onUpdate: () => renders++ });
    const before = renders;
    clock.advance(1, 60);
    expect(renders - before).toBe(30);
  });

  it('stops listening to the clock when disposed', () => {
    const { clock, motion } = setup();
    const box = { x: 0 };
    motion.to(box, { x: 1 }, { duration: 1 });
    motion.dispose();
    clock.advance(2);
    expect(box.x).toBe(0);
  });
});
