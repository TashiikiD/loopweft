import { describe, expect, it } from 'vitest';
import { cubicBezier, ease } from '../src/index.ts';

const NAMES = [
  'none',
  'linear',
  'power0.out',
  'power1.in',
  'power1.out',
  'power1.inOut',
  'power2.in',
  'power2.out',
  'power2.inOut',
  'power3.out',
  'power4.inOut',
  'sine.in',
  'sine.out',
  'sine.inOut',
  'expo.in',
  'expo.out',
  'expo.inOut',
  'circ.inOut',
  'back.in',
  'back.out',
  'back.out(2.4)',
  'back.inOut',
  'cubic-bezier(0.22, 1, 0.36, 1)',
];

describe('eases', () => {
  it('start at 0 and end at 1', () => {
    for (const name of NAMES) {
      const curve = ease(name);
      expect(curve(0), name).toBeCloseTo(0, 6);
      expect(curve(1), name).toBeCloseTo(1, 6);
    }
  });

  it('follow the GSAP power family: power1 is quadratic, power2 cubic', () => {
    expect(ease('power1.in')(0.5)).toBeCloseTo(0.25, 10);
    expect(ease('power2.out')(0.5)).toBeCloseTo(0.875, 10);
    expect(ease('power3.in')(0.5)).toBeCloseTo(0.0625, 10);
    expect(ease('power2.inOut')(0.5)).toBeCloseTo(0.5, 10);
    // An unsuffixed name eases out, as in GSAP.
    expect(ease('power2')(0.5)).toBe(ease('power2.out')(0.5));
  });

  it('overshoot with back, by the amount given', () => {
    const peak = (name: string) => Math.max(...Array.from({ length: 101 }, (_, i) => ease(name)(i / 100)));
    expect(peak('back.out')).toBeGreaterThan(1);
    expect(peak('back.out(2.4)')).toBeGreaterThan(peak('back.out(1)'));
  });

  it('match CSS cubic-bezier timing', () => {
    expect(cubicBezier(0, 0, 1, 1)(0.37)).toBeCloseTo(0.37, 6);
    // CSS "ease" at its midpoint (a well-known value).
    expect(cubicBezier(0.25, 0.1, 0.25, 1)(0.5)).toBeCloseTo(0.8024, 3);
  });

  it('refuse names they do not know, rather than animating linearly by surprise', () => {
    expect(() => ease('powr2.out')).toThrow('Unknown ease "powr2.out".');
    expect(() => ease('power2.sideways')).toThrow();
    expect(ease(undefined)(0.5)).toBe(ease('power1.out')(0.5));
    expect(ease((t) => t * t)(0.5)).toBe(0.25);
  });
});
