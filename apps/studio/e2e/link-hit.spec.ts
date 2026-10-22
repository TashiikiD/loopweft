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
  // Every third link: among them, a dozen whose middles lay under a neighbour's click band before this was fixed.
  for (const id of all.filter((_, i) => i % 3 === 0)) {
    const at = await page.evaluate((edge) => {
      const path = document.querySelector(`.lw-edges [data-edge="${edge}"] path.line`) as SVGPathElement;
      const p = path.getPointAtLength(path.getTotalLength() / 2);
      return new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM() as DOMMatrix);
    }, id);
    await page.mouse.click(at.x, at.y);
    const selected = await page
      .locator('.lw-edges .lw-edge.selected')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-edge')));
    if (selected.join() !== id) missed.push(`${id} selected ${selected.join() || 'nothing'}`);
    await page.keyboard.press('Escape');
  }
  expect(missed).toEqual([]);
  // No sign was flipped on the way.
  expect(await page.evaluate(() => document.querySelectorAll('.lw-edge .head.minus').length)).toBe(before);
  await expect(page.getByRole('button', { name: /^Undo/ })).toHaveAccessibleName('Undo');
});
