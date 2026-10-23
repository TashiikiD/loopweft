// The Studio in a narrow window, 1040 × 900 (about half a laptop screen): the header keeps one row with the
// longest title (the example's), the Story stage keeps most of the width with the scene list folded behind a
// button, choosing a tool never moves the stage, and the table's toolbar shows every button whole.
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { plainBrowser, save } from './story.ts';

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
  // The save status is a mark here: its words stay in the live status, out of sight.
  const status = page.getByLabel(/^Save status: /);
  await expect(status).toBeVisible();
  const label = await box(status.locator('.lw-save-label'));
  expect(label.width).toBeLessThanOrEqual(1);
  await expect(status).toHaveText('Save status: Not saved yet');
  await shot(page, 'narrow-1-header');
});

test('the save status tells saved from unsaved by its mark, not only its colour, and the keyboard reaches its words', async ({
  page,
}) => {
  const status = page.getByLabel(/^Save status: /);
  // The example, never saved: "!", and the live status's text says so.
  await expect(status).toHaveAttribute('data-saved', 'false');
  await expect(status.locator('.tabler-icon-exclamation-mark')).toBeVisible();
  await expect(status.locator('.tabler-icon-check')).toHaveCount(0);
  // Its tooltip, with its words, opens on keyboard focus.
  await status.focus();
  await expect(page.getByRole('tooltip')).toHaveText('Not saved yet');
  // Saved: a tick, and the live text changes with it.
  await save(page);
  await expect(status).toHaveText(/^Save status: Saved/);
  await expect(status).toHaveAttribute('data-saved', 'true');
  await expect(status.locator('.tabler-icon-check')).toBeVisible();
  await expect(status.locator('.tabler-icon-exclamation-mark')).toHaveCount(0);
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
  // The scene list opens over the stage, which keeps its size; choosing a step closes it.
  const scenes = page.getByRole('button', { name: 'Scenes' });
  await scenes.click();
  await expect(outline).toBeVisible();
  expect((await box(stage)).width).toBe(wide.width);
  await shot(page, 'narrow-2-scenes-open');
  await outline.getByRole('button', { name: /^S04\.1\s/ }).click();
  await expect(outline).toBeHidden();
  await expect(page.locator('.lw-viewbar')).toContainText('S04.1');
  // Every tool leaves the stage where it is.
  const tools = page.getByRole('radiogroup', { name: 'Record tool' });
  const top = (await box(stage)).y;
  for (const name of ['Show', 'Trend', 'Spread', 'Pulse', 'Frame', 'Look', 'Show']) {
    await tools.getByText(name, { exact: true }).click();
    expect((await box(stage)).y, `with ${name}`).toBe(top);
  }
  await shot(page, 'narrow-3-story-show');
});

test('the scene list over the stage closes with the pointer alone: its Close button, or a scene chosen', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Story' }).click();
  const outline = page.getByRole('navigation', { name: 'Story outline' });
  const scenes = page.getByRole('button', { name: 'Scenes' });
  await scenes.click();
  await expect(outline).toBeVisible();
  await outline.getByRole('button', { name: 'Close scenes' }).click();
  await expect(outline).toBeHidden();
  await expect(scenes).toHaveAttribute('aria-expanded', 'false');
  // A scene's own row chosen closes it too.
  await scenes.click();
  await outline.locator('.lw-outline-scene-head .lw-outline-pick').nth(2).click();
  await expect(outline).toBeHidden();
});

test('the scene list over the stage works from the keyboard: in on opening, Escape out, the focus back', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Story' }).click();
  const outline = page.getByRole('navigation', { name: 'Story outline' });
  const scenes = page.getByRole('button', { name: 'Scenes' });
  await expect(scenes).toHaveAttribute('aria-controls', 'lw-story-outline');
  await scenes.focus();
  await page.keyboard.press('Enter');
  await expect(outline).toBeVisible();
  await expect(outline.getByRole('button', { name: 'Close scenes' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(outline).toBeHidden();
  await expect(scenes).toBeFocused();
});

test('a scene name left half typed survives the window narrowing', async ({ page }) => {
  await page.setViewportSize({ width: 1300, height: 900 });
  await page.getByRole('tab', { name: 'Story' }).click();
  const outline = page.getByRole('navigation', { name: 'Story outline' });
  await expect(outline).toBeVisible();
  await outline.getByRole('button', { name: 'Scene', exact: true }).click();
  const field = outline.getByRole('textbox', { name: 'Title of the new scene' });
  await field.fill('A scene half named');
  // The focus elsewhere: the list folds as the window narrows, and keeps the name.
  await page.locator('.lw-story-frame').focus();
  await page.setViewportSize({ width: 1040, height: 900 });
  await expect(outline).toBeHidden();
  await page.getByRole('button', { name: 'Scenes' }).click();
  await expect(field).toHaveValue('A scene half named');
});

test('a scene name being typed as the window narrows stays in reach of the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 1300, height: 900 });
  await page.getByRole('tab', { name: 'Story' }).click();
  const outline = page.getByRole('navigation', { name: 'Story outline' });
  await outline.getByRole('button', { name: 'Scene', exact: true }).click();
  const field = outline.getByRole('textbox', { name: 'Title of the new scene' });
  await expect(field).toBeFocused();
  await page.keyboard.type('A scene typed');
  await page.setViewportSize({ width: 1040, height: 900 });
  // The list stays open over the stage, the field visible and still focused.
  await expect(page.getByRole('button', { name: 'Scenes', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(field).toBeVisible();
  await expect(field).toBeFocused();
  await page.keyboard.type(' on, across the resize');
  await page.keyboard.press('Enter');
  await expect(
    outline.locator('.lw-outline-scene-head', { hasText: 'A scene typed on, across the resize' }),
  ).toHaveCount(1);
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
