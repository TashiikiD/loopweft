// The Studio in a narrow window, 1040 × 900 (about half a laptop screen): the header keeps one row with the
// longest title (the example's), the Story stage keeps most of the width with the scene list folded behind a
// button, choosing a tool never moves the stage, and the table's toolbar shows every button whole.
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { plainBrowser } from './story.ts';

plainBrowser();

const REVIEW = process.env.LOOPWEFT_REVIEW ? resolve(process.env.LOOPWEFT_REVIEW) : null;
async function shot(page: Page, name: string) {
  if (!REVIEW) return;
  mkdirSync(REVIEW, { recursive: true });
  await page.screenshot({ path: join(REVIEW, `${name}.png`) });
}

const box = async (locator: Locator) => {
  const b = await locator.boundingBox();
  if (!b) throw new Error('not drawn');
  return b;
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1040, height: 900 });
  await page.goto('/?example');
  await expect(page.locator('[data-node]').first()).toBeVisible();
});

test('the header keeps one row: the title gives way, the tabs never wrap', async ({ page }) => {
  const header = page.locator('header').first();
  const head = await box(header);
  const tabs = page.getByRole('tab', { name: /^(Map|Sources|Story|Present|Export)$/ });
  await expect(tabs).toHaveCount(5);
  const tops = await tabs.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  // Everything in the header lies inside it.
  for (const part of [
    page.getByRole('button', { name: /\(rename\)$/ }),
    tabs.first(),
    tabs.last(),
    page.getByRole('button', { name: 'File' }),
    page.getByRole('button', { name: 'Save', exact: true }),
  ]) {
    const b = await box(part);
    expect(b.y).toBeGreaterThanOrEqual(head.y);
    expect(b.y + b.height).toBeLessThanOrEqual(head.y + head.height);
  }
  // The long title is cut short before the tabs, and its whole name stays its name.
  const title = await box(page.getByRole('button', { name: /\(rename\)$/ }));
  expect(title.x + title.width).toBeLessThanOrEqual((await box(tabs.first())).x);
  // The save status is a dot here; its words stay in its name.
  const status = page.getByLabel(/^Save status: /);
  await expect(status).toBeVisible();
  await expect(status.locator('.lw-save-label')).toBeHidden();
  await expect(status.locator('.lw-save-dot')).toBeVisible();
  await shot(page, 'narrow-1-header');
});

test('the Story stage keeps the width, the scene list opens over it, and tools never move it', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Story' }).click();
  const outline = page.getByRole('navigation', { name: 'Story outline' });
  await expect(outline).toBeHidden();
  const stage = page.locator('.lw-story-frame');
  const wide = await box(stage);
  expect(wide.width).toBeGreaterThan(560);
  // The scene list opens over the stage, which keeps its size, and Escape closes it.
  const scenes = page.getByRole('button', { name: 'Scenes' });
  await scenes.click();
  await expect(outline).toBeVisible();
  expect((await box(stage)).width).toBe(wide.width);
  await shot(page, 'narrow-2-scenes-open');
  const step = outline.getByRole('button', { name: /^S04\.1\s/ });
  await step.click();
  await step.press('Escape');
  await expect(outline).toBeHidden();
  // Every tool leaves the stage where it is.
  const tools = page.getByRole('radiogroup', { name: 'Record tool' });
  const top = (await box(stage)).y;
  for (const name of ['Show', 'Trend', 'Spread', 'Pulse', 'Frame', 'Look', 'Show']) {
    await tools.getByText(name, { exact: true }).click();
    expect((await box(stage)).y, `with ${name}`).toBe(top);
  }
  await shot(page, 'narrow-3-story-show');
});

test('the table toolbar shows every button whole', async ({ page }) => {
  await page.getByRole('radiogroup', { name: 'Show the map as' }).getByText('Table', { exact: true }).click();
  const remove = page.getByRole('button', { name: /^Remove / });
  await expect(remove).toBeVisible();
  const b = await box(remove);
  expect(b.x + b.width).toBeLessThanOrEqual(1040);
  const whole = await remove.evaluate((el) => {
    const label = el.querySelector('.mantine-Button-label') as HTMLElement;
    return label.scrollWidth <= label.clientWidth + 1;
  });
  expect(whole).toBe(true);
  await shot(page, 'narrow-4-table');
});
