// The ripple made visible: the Map's Ripple panel draws the ripple on the canvas while it is open, and "Make a
// story step from it" adds a step that shows it, which the Studio then plays on the Story stage.
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { choose, plainBrowser } from './story.ts';

plainBrowser();

const REVIEW = process.env.LOOPWEFT_REVIEW ? resolve(process.env.LOOPWEFT_REVIEW) : null;
async function shot(page: Page, name: string) {
  if (!REVIEW) return;
  mkdirSync(REVIEW, { recursive: true });
  await page.screenshot({ path: join(REVIEW, `${name}.png`) });
}

test('a ripple drawn on the map becomes a story step that lights it, marks it and pulses along it', async ({
  page,
}) => {
  await page.goto('/?example');
  const map = page.getByRole('img', { name: /^The map:/ });
  // The example takes a while to open on a busy machine.
  await expect(map.locator('[data-edge]').first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: 'Ripple' }).click();
  await choose(page, page.getByRole('combobox', { name: 'Start from' }), 'Supply-chain fragility');
  const status = page.getByRole('status').filter({ hasText: /^It reaches/ });
  const reached = Number((await status.innerText()).match(/^It reaches (\d+) variables/)?.[1]);
  expect(reached).toBeGreaterThan(3);
  // Drawn on the map: the start and what it reaches lit and marked, the rest faded.
  await expect(map).toHaveClass(/rippling/);
  await expect(map.locator('[data-node].lit')).toHaveCount(reached + 1);
  await expect(map.locator('[data-node] .lw-trend')).toHaveCount(reached + 1);
  await expect(map.locator('[data-node="supply_chain_fragility"] .lw-trend.up')).toBeVisible();
  const faded = await map
    .locator('[data-node]:not(.lit)')
    .first()
    .evaluate((el) => getComputedStyle(el).opacity);
  expect(Number(faded)).toBeLessThan(0.5);
  await shot(page, 'ripple-1-map');

  // A step at the end of the last scene, S10, whose steps show its caption.
  await expect(page.getByRole('combobox', { name: 'At the end of' })).toHaveValue(/^S10 · /);
  await page.getByRole('button', { name: 'Make a story step from it' }).click();
  await expect(page.getByRole('tab', { name: 'Story' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.lw-viewbar')).toContainText('S10.5 · Supply-chain fragility rises');
  // The stage plays it: the caption, and every mark once the pulses have landed.
  const stage = page.locator('.lw-story-frame');
  await expect(stage.locator('.caption-kicker')).toBeVisible();
  await page.getByRole('button', { name: 'Skip to the end of the motion' }).click();
  await expect
    .poll(() =>
      stage
        .locator('.node-trend.up, .node-trend.down, .node-trend.mixed')
        .evaluateAll((els) => els.filter((e) => Number(getComputedStyle(e).opacity) > 0.5).length),
    )
    .toBe(reached + 1);
  await shot(page, 'ripple-2-story');
  // Back on the Map the canvas is the map again.
  await page.getByLabel('Workspaces').getByRole('tab', { name: 'Map' }).click();
  await expect(map).not.toHaveClass(/rippling/);
});
