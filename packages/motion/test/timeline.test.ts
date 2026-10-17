import { describe, expect, it } from 'vitest';
import { land, Timeline } from '../src/index.ts';

describe('timelines', () => {
  it('tween a property from its value at the start to the target, with the ease', () => {
    const box = { x: 10 };
    const tl = new Timeline().to(box, { x: 20 }, { duration: 1, ease: 'none', at: 1 });
    tl.seek(0.5);
    expect(box.x).toBe(10);
    tl.seek(1.5);
    expect(box.x).toBe(15);
    tl.seek(2);
    expect(box.x).toBe(20);
    expect(tl.duration).toBe(2);
    expect(tl.completed).toBe(true);
  });

  it('read where a property is when the tween starts, so tweens chain', () => {
    const box = { x: 0 };
    const tl = new Timeline()
      .to(box, { x: 10 }, { duration: 1, ease: 'none' })
      .to(box, { x: 30 }, { duration: 1, ease: 'none', at: 1 });
    tl.seek(1.5);
    expect(box.x).toBe(20);
  });

  it('show the from state of fromTo at once, so staggered entrances wait unseen', () => {
    const card = { opacity: 1, y: 0 };
    const tl = new Timeline().fromTo(
      card,
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0 },
      { duration: 1, at: 2 },
    );
    expect(card).toEqual({ opacity: 0, y: 24 });
    tl.seek(1);
    expect(card).toEqual({ opacity: 0, y: 24 });
    tl.seek(3);
    expect(card).toEqual({ opacity: 1, y: 0 });
  });

  it('set values when the playhead reaches them', () => {
    const box = { v: 0, label: 'a' };
    const tl = new Timeline().set(box, { v: 5, label: 'b' }, 1);
    tl.seek(0.5);
    expect(box).toEqual({ v: 0, label: 'a' });
    tl.seek(1);
    expect(box).toEqual({ v: 5, label: 'b' });
  });

  it('call functions once, in time order, even when the playhead jumps past them', () => {
    const calls: string[] = [];
    const tl = new Timeline()
      .call(() => calls.push('b'), 2)
      .call(() => calls.push('a'), 1)
      .call(() => calls.push('start'), 0);
    tl.seek(0);
    expect(calls).toEqual(['start']);
    tl.seek(5);
    tl.seek(6);
    expect(calls).toEqual(['start', 'a', 'b']);
  });

  it('land: jump to the end with every final state, callback and completion', () => {
    const box = { x: 0, y: 0 };
    const events: string[] = [];
    const tl = new Timeline({ onComplete: () => events.push('done') })
      .to(box, { x: 100 }, { duration: 2, onComplete: () => events.push('x') })
      .to(box, { y: 50 }, { duration: 1, at: 3, onStart: () => events.push('y starts') })
      .call(() => events.push('call'), 2.5);
    land(tl);
    expect(box).toEqual({ x: 100, y: 50 });
    expect(events).toEqual(['x', 'call', 'y starts', 'done']);
    expect(land(null)).toBeNull();
  });

  it('let the later-starting tween win while two drive the same property', () => {
    const box = { x: 0 };
    const tl = new Timeline()
      .to(box, { x: 100 }, { duration: 4, ease: 'none' })
      .to(box, { x: -10 }, { duration: 1, ease: 'none', at: 1 });
    // The second tween starts from where the first had got to (25) and wins while both run…
    tl.seek(1);
    tl.seek(1.5);
    expect(box.x).toBe(7.5);
    tl.seek(2);
    expect(box.x).toBe(-10);
    // …and once it has finished, the first carries on.
    tl.seek(3);
    expect(box.x).toBe(75);
  });

  it('run update callbacks while a tween plays, and not after it has finished', () => {
    const box = { x: 0 };
    let updates = 0;
    const tl = new Timeline().to(box, { x: 1 }, { duration: 1, onUpdate: () => updates++ });
    tl.seek(0.25).seek(0.5).seek(1).seek(1.5).seek(2);
    expect(updates).toBe(3);
  });

  it('play nested timelines on the parent playhead', () => {
    const box = { x: 0 };
    const inner = new Timeline().to(box, { x: 10 }, { duration: 1, ease: 'none' });
    const outer = new Timeline().add(inner, 2);
    expect(outer.duration).toBe(3);
    outer.seek(2.5);
    expect(box.x).toBe(5);
  });

  it('give the same values whether played frame by frame or landed', () => {
    const play = (frames: number) => {
      const box = { a: 0, b: 1 };
      const tl = new Timeline()
        .to(box, { a: 7 }, { duration: 0.7, ease: 'back.out(1.9)' })
        .to(box, { b: 0 }, { duration: 0.3, ease: 'power2.inOut', at: 0.5 });
      if (frames === 0) tl.land();
      else for (let i = 1; i <= frames; i++) tl.seek((i / frames) * 1.2);
      return box;
    };
    expect(play(0)).toEqual(play(60));
    expect(play(17)).toEqual(play(0));
  });
});
