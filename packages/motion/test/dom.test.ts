// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ManualClock, Motion, Timeline } from '../src/index.ts';

const SVG = 'http://www.w3.org/2000/svg';

describe('DOM targets', () => {
  it('tween inline styles, with px for lengths', () => {
    const el = document.createElement('div');
    el.style.opacity = '0';
    new Timeline().to(el, { opacity: 1, width: 100 }, { duration: 1, ease: 'none' }).seek(0.5);
    expect(el.style.opacity).toBe('0.5');
    expect(el.style.width).toBe('50px');
  });

  it('read opacity as 1 when nothing sets it', () => {
    const el = document.createElement('div');
    new Timeline().to(el, { opacity: 0 }, { duration: 1, ease: 'none' }).seek(0.25);
    expect(el.style.opacity).toBe('0.75');
  });

  it('tween attributes', () => {
    const ring = document.createElementNS(SVG, 'circle');
    ring.setAttribute('r', '10');
    new Timeline().to(ring, { attr: { r: 50 } }, { duration: 1, ease: 'none' }).seek(0.5);
    expect(ring.getAttribute('r')).toBe('30');
  });

  it('compose transforms: CSS on HTML, the transform attribute on SVG', () => {
    const line = document.createElement('div');
    new Timeline()
      .fromTo(line, { y: 16, opacity: 0 }, { y: 0, opacity: 1 }, { duration: 1, ease: 'none' })
      .seek(0.5);
    expect(line.style.transform).toBe('translate(0px, 8px)');

    const badge = document.createElementNS(SVG, 'g');
    new Timeline().fromTo(badge, { scale: 0.2 }, { scale: 1 }, { duration: 1, ease: 'none' }).seek(0.5);
    expect(badge.getAttribute('transform')).toBe('scale(0.6 0.6)');
    new Timeline().set(badge, { scale: 1 }).seek(0);
    expect(badge.hasAttribute('transform')).toBe(false);
  });

  it('set string styles as they are', () => {
    const rule = document.createElement('div');
    const motion = new Motion(new ManualClock());
    motion.set(rule, { transformOrigin: '0% 50%', scaleX: 0 });
    expect(rule.style.transformOrigin).toBe('0% 50%');
    expect(rule.style.transform).toBe('scale(0, 1)');
  });

  it('write rounded numbers, so the DOM text is the same on every run', () => {
    const el = document.createElement('div');
    new Timeline().to(el, { opacity: 0 }, { duration: 3, ease: 'none' }).seek(1);
    expect(el.style.opacity).toBe('0.6667');
  });
});
