// Clicking a link on the map selects that link, wherever links run close together: the example, fitted to the
// window, has 132 links, many of them crossing or running side by side, and a click on the middle of a link's
// curve must select it (not a neighbour whose wider click band lies on top), and never flip another link's sign
// through an arrowhead that happens to sit there.
import { expect, test } from '@playwright/test';

test('a click on the middle of a link selects that link, among close neighbours', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/?example');
  await page.locator('[data-edge]').first().waitFor();
  await page.getByRole('button', { name: 'Fit' }).click();
  await page.waitForTimeout(800);
  const all = await page
    .locator('.lw-edges [data-edge]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-edge') as string));
  expect(all).toHaveLength(132);
  const before = await page.evaluate(() => document.querySelectorAll('.lw-edge .head.minus').length);
  const missed: string[] = [];
  let tried = 0;
  // Every third link: among them, a dozen whose middles lay under a neighbour's click band before this was fixed.
  for (const id of all.filter((_, i) => i % 3 === 0)) {
    // A point on its curve, as near its middle as can be while 4 pixels clear of every other line (where two
    // lines cross, the one drawn on top takes the click, as it should).
    const at = await page.evaluate((edge) => {
      const lines = [...document.querySelectorAll<SVGPathElement>('.lw-edges path.line')];
      const onScreen = (path: SVGPathElement, f: number) => {
        const p = path.getPointAtLength(path.getTotalLength() * f);
        return new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM() as DOMMatrix);
      };
      const others = lines
        .filter((l) => l.closest('[data-edge]')?.getAttribute('data-edge') !== edge)
        .map((l) => Array.from({ length: 81 }, (_, i) => onScreen(l, i / 80)));
      const own = document.querySelector(`.lw-edges [data-edge="${edge}"] path.line`) as SVGPathElement;
      for (const f of [0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65, 0.3, 0.7]) {
        const q = onScreen(own, f);
        const clear = others.every((pts) =>
          pts.every((r, i) => {
            const n = pts[i + 1] ?? r;
            const [dx, dy] = [n.x - r.x, n.y - r.y];
            const t = Math.max(
              0,
              Math.min(1, ((q.x - r.x) * dx + (q.y - r.y) * dy) / (dx * dx + dy * dy || 1)),
            );
            return Math.hypot(q.x - r.x - t * dx, q.y - r.y - t * dy) >= 4;
          }),
        );
        if (clear) return { x: q.x, y: q.y };
      }
      return null;
    }, id);
    if (!at) continue;
    tried++;
    await page.mouse.click(at.x, at.y);
    const selected = await page
      .locator('.lw-edges .lw-edge.selected')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-edge')));
    if (selected.join() !== id) missed.push(`${id} selected ${selected.join() || 'nothing'}`);
    await page.keyboard.press('Escape');
  }
  expect(missed).toEqual([]);
  expect(tried).toBeGreaterThan(30);
  // No sign was flipped on the way.
  expect(await page.evaluate(() => document.querySelectorAll('.lw-edge .head.minus').length)).toBe(before);
  await expect(page.getByRole('button', { name: /^Undo/ })).toHaveAccessibleName('Undo');
});
