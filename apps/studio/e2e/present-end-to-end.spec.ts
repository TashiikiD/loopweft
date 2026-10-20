// The Phase 5 checkpoint: present a map end to end. The polycrisis example, presented from the Studio with
// the presenter console and the audience window it opens, through all 70 steps with the keys a clicker sends
// (PageDown, Space, →), from either window; checking at every step that both windows show the same step.
// On the way: the clock, replay, skip, pause, blackout, categories in words, the audience window reloaded
// mid-talk, the Studio itself reloaded mid-talk (the console comes back at the same step and the audience
// window, still open, finds it again), and jumps by scene number, Home and End. Besides the step each window
// names, the stages themselves are checked at steps that look different (the scene's caption, the figure,
// categories in words), in the audience window and in the console's live preview, after each reload too.
// With LOOPWEFT_REVIEW set to a folder, screens of both windows are saved there for the review.
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readProject } from '@loopweft/model';
import { deckOf } from '@loopweft/player';
import { expect, type Locator, type Page, test } from '@playwright/test';

const REVIEW = process.env.LOOPWEFT_REVIEW ? resolve(process.env.LOOPWEFT_REVIEW) : null;

async function shot(page: Page, name: string) {
  if (!REVIEW) return;
  mkdirSync(REVIEW, { recursive: true });
  await page.screenshot({ path: join(REVIEW, `${name}.png`) });
}

const read = readProject(readFileSync(resolve('examples/polycrisis.loopweft'), 'utf8'));
if (!read.ok) throw new Error('The example does not open.');
const DECK = deckOf(read.project);
/** Every step of the example, in order: "S00.1" … "S10.4". */
const KEYS = DECK.scenes.flatMap((s) => s.steps.map((t) => t.key));
/** The example's category names, as categories in words write them under the labels. */
const CATEGORIES = new RegExp(
  `^(${read.project.types.categories.map((c) => c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`,
);
/** The caption a step's scene shows: "04 · How crises cascade". */
const captionOf = (key: string) => {
  const scene = DECK.scenes.find((s) => key.startsWith(`${s.id}.`));
  return `${String(scene?.number).padStart(2, '0')} · ${scene?.title}`;
};

const hashOf = (page: Page) => page.evaluate(() => decodeURIComponent(location.hash));

/** The console's line under the scene title names the step on show. */
const consoleAt = async (console_: Locator) =>
  /· (S\d\d\.[0-9a-z]+) ·/.exec((await console_.locator('.lp-scene-sub').textContent()) ?? '')?.[1];

test('present a map end to end', async ({ page, context }) => {
  test.setTimeout(300_000);
  expect(KEYS).toHaveLength(70);
  await page.goto('/?example');
  await page.getByRole('tab', { name: 'Present' }).click();
  await page.getByRole('button', { name: 'Open the console' }).click();
  let console_ = page.getByRole('dialog', { name: 'Presenter console' });
  const [audience] = await Promise.all([
    context.waitForEvent('page'),
    console_.getByRole('button', { name: 'Open audience window' }).click(),
  ]);
  await expect(audience.locator('.lw-stage')).toHaveCount(1, { timeout: 15_000 });
  await expect(console_.locator('.lp-status .lp-chip.ok')).toHaveText('Audience connected', {
    timeout: 10_000,
  });

  /** Both windows show step `i`. */
  const bothAt = async (i: number) => {
    const key = KEYS[i] as string;
    await expect.poll(() => hashOf(audience), { message: `the audience window at ${key}` }).toBe(`#${key}`);
    await expect.poll(() => consoleAt(console_), { message: `the console at ${key}` }).toBe(key);
  };
  /** The two stages, as drawn: the audience window's, and the console's live copy of it. */
  const stages = () => [audience.locator('.lw-stage'), console_.locator('.lp-preview .lw-stage')];
  /** Both stages draw step `i`: each shows its scene's caption. */
  const stagesShow = async (i: number) => {
    const key = KEYS[i] as string;
    for (const stage of stages()) {
      await expect(stage).toHaveCount(1);
      await expect(stage.locator('.caption-kicker', { hasText: captionOf(key) }), key).toBeVisible();
    }
  };
  await bothAt(0);
  await page.waitForTimeout(1500);
  await shot(page, 'e2e-01-console-S00.1');
  await shot(audience, 'e2e-02-audience-S00.1');

  // The clock starts on T, as the talk begins.
  await page.keyboard.press('t');
  await expect(console_.locator('.lp-btn-clock')).toHaveText('⏸ Pause clock');

  const clicker = ['PageDown', ' ', 'ArrowRight'];
  for (let i = 1; i < KEYS.length; i++) {
    const key = KEYS[i] as string;
    // Most steps from the console, every fourth from the audience window: keys work in either.
    const from = i % 4 === 0 ? audience : page;
    await from.keyboard.press(clicker[i % 3] as string);
    await bothAt(i);

    if (['S01.3', 'S04.2a', 'S06.1', 'S10.3'].includes(key)) await stagesShow(i);
    if (key === 'S01.3') {
      await page.waitForTimeout(2500);
      await shot(page, 'e2e-03-console-S01.3');
      await shot(audience, 'e2e-04-audience-S01.3');
    }
    if (key === 'S04.2a') {
      // Replay and skip leave the show where it is; pause shows on the console.
      await page.keyboard.press('r');
      await page.keyboard.press('s');
      await bothAt(i);
      await page.keyboard.press('p');
      await expect(console_.getByText('Animation paused')).toBeVisible();
      await page.keyboard.press('p');
      await expect(console_.getByText('Animation paused')).toBeHidden();
      // Categories in words, on both stages: each names categories of the example under the labels.
      await page.keyboard.press('c');
      for (const stage of stages()) {
        await expect(stage).toHaveClass(/category-words/);
        await expect(stage.locator('.map-label-category:not([hidden])').first()).toHaveText(CATEGORIES);
      }
      await page.waitForTimeout(1500);
      await shot(page, 'e2e-05-console-S04.2a-categories');
      await shot(audience, 'e2e-06-audience-S04.2a-categories');
      // Off again, from the audience window: off on both.
      await audience.keyboard.press('c');
      for (const stage of stages()) {
        await expect(stage).not.toHaveClass(/category-words/);
        await expect(stage.locator('.map-label-category:not([hidden])')).toHaveCount(0);
      }
    }
    if (key === 'S05.6b') {
      // The Richards et al. figure, on both stages.
      for (const stage of stages()) await expect(stage.locator('img')).toBeVisible();
      await page.waitForTimeout(2500);
      await shot(audience, 'e2e-07-audience-S05.6b-figure');
    }
    if (key === 'S06.1') {
      // Blackout from the console: the audience window goes black, and comes back.
      await page.keyboard.press('b');
      await expect(audience.locator('.lp-blackout.on')).toHaveCount(1);
      await expect(console_.getByText('Blackout on')).toBeVisible();
      await page.keyboard.press('.');
      await expect(audience.locator('.lp-blackout.on')).toHaveCount(0);
    }
    if (key === 'S07.3') {
      // A frozen audience window is reloaded mid-talk: it gets the map again and finds the step.
      await audience.reload();
      await expect(audience.locator('.lw-stage')).toHaveCount(1, { timeout: 15_000 });
      await bothAt(i);
      await stagesShow(i);
    }
    if (key === 'S08.4') {
      // The Studio itself is reloaded mid-talk. The audience window keeps its place, and its keys still work.
      await page.reload();
      await audience.keyboard.press('PageDown');
      i++;
      await expect.poll(() => hashOf(audience)).toBe(`#${KEYS[i]}`);
      // Back in the Studio, the Present workspace shows the saved place; the console opens there, and the
      // audience window, still open, finds it.
      await page.getByRole('tab', { name: 'Present' }).click();
      await expect(page.getByText('This browser saved a place from an earlier run')).toBeVisible();
      await page.getByRole('button', { name: 'Open the console' }).click();
      console_ = page.getByRole('dialog', { name: 'Presenter console' });
      await bothAt(i);
      await stagesShow(i);
      await expect(console_.locator('.lp-status .lp-chip.ok')).toHaveText('Audience connected', {
        timeout: 10_000,
      });
    }
  }
  await page.waitForTimeout(2500);
  await shot(page, 'e2e-08-console-S10.4');
  await shot(audience, 'e2e-09-audience-S10.4');

  // The end holds: another key changes nothing.
  await page.keyboard.press('PageDown');
  await bothAt(KEYS.length - 1);
  // A scene by its number, then the first and last steps.
  await page.keyboard.press('4');
  await page.keyboard.press('Enter');
  await bothAt(KEYS.indexOf('S04.1'));
  await audience.keyboard.press('Home');
  await bothAt(0);
  await page.keyboard.press('End');
  await bothAt(KEYS.length - 1);
});
