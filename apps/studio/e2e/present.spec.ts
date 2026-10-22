// The Studio's Present and Export workspaces: the presenter console over the Studio and the audience window
// it opens (a second page that gets the map from the console), kept in step both ways and rejoining after a
// reload; the rehearsal in one window; and the one-file HTML downloaded with or without the notes. With
// LOOPWEFT_REVIEW set to a folder, screens are saved there for the review.
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

const REVIEW = process.env.LOOPWEFT_REVIEW ? resolve(process.env.LOOPWEFT_REVIEW) : null;

async function shot(page: Page, name: string) {
  if (!REVIEW) return;
  mkdirSync(REVIEW, { recursive: true });
  await page.screenshot({ path: join(REVIEW, `${name}.png`) });
}

const hashOf = (page: Page) => page.evaluate(() => decodeURIComponent(location.hash));

// Saving goes through a download: the browser's own save dialog (File System Access) cannot be driven.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.showSaveFilePicker;
    delete w.showOpenFilePicker;
  });
});

test('present the example from the Studio: the console, the audience window, a rehearsal', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await page.goto('/?example');
  await page.getByRole('tab', { name: 'Present' }).click();
  await expect(page.getByText('11 scenes · 70 steps · 14:00 in all')).toBeVisible();
  await shot(page, 'present-1-workspace');

  await page.getByRole('button', { name: 'Open the console' }).click();
  const console_ = page.getByRole('dialog', { name: 'Presenter console' });
  await expect(console_.locator('.lp-scene-sub')).toHaveText(/^Step 1 of 1 · S00\.1/);
  const [audience] = await Promise.all([
    context.waitForEvent('page'),
    console_.getByRole('button', { name: 'Open audience window' }).click(),
  ]);
  await expect(audience).toHaveURL(/audience\.html\?show=[0-9a-f]{8}/);
  // The audience window has no map of its own: it asks the console, then plays it.
  await expect(audience.locator('.lw-stage')).toHaveCount(1, { timeout: 15_000 });
  await expect(console_.locator('.lp-status .lp-chip.ok')).toHaveText('Audience connected', {
    timeout: 10_000,
  });

  await page.keyboard.press('PageDown');
  await expect.poll(() => hashOf(audience)).toBe('#S01.1');
  await audience.keyboard.press('PageDown');
  await expect(console_.locator('.lp-scene-sub')).toHaveText(/^Step 2 of 4 · S01\.2/);
  await audience.reload();
  await expect(audience.locator('.lw-stage')).toHaveCount(1, { timeout: 15_000 });
  await expect.poll(() => hashOf(audience)).toBe('#S01.2');
  await page.keyboard.press('PageDown');
  await expect.poll(() => hashOf(audience)).toBe('#S01.3');
  await page.waitForTimeout(1200);
  await shot(page, 'present-2-console');
  await shot(audience, 'present-3-audience');

  await console_.getByRole('button', { name: 'Back to the Studio' }).click();
  await expect(console_).toHaveCount(0);
  // The place stays saved, with a way back to the start.
  await expect(page.getByText('This browser saved a place from an earlier run')).toBeVisible();

  // A rehearsal, with the audience window still open: the rehearsal keeps to itself.
  await page.getByRole('button', { name: 'Rehearse', exact: true }).click();
  const rehearsal = page.getByRole('dialog', { name: 'Rehearsal' });
  await expect(rehearsal.locator('.lw-stage')).toHaveCount(1);
  await page.keyboard.press('n');
  await expect(rehearsal.locator('.lp-rehearsal')).toBeVisible();
  await expect(rehearsal.locator('.lp-rehearsal h2')).toHaveText('Scene 01 · step 3 of 4');
  await shot(page, 'present-4-rehearsal');
  await page.keyboard.press('PageDown');
  await expect(rehearsal.locator('.lp-rehearsal h2')).toHaveText('Scene 01 · step 4 of 4');
  await page.waitForTimeout(1500);
  expect(await hashOf(audience)).toBe('#S01.3');
  await page.keyboard.press('Escape');
  await expect(rehearsal).toHaveCount(0);
  // The rehearsal kept a place of its own.
  await expect(page.getByText(/^It picks up at S01\.4, where the last rehearsal stopped/)).toBeVisible();

  // The console, opened again beside the audience window that stayed open, agrees with it, and the two
  // move together from there: no step skipped on the projector.
  await page.getByRole('button', { name: 'Open the console' }).click();
  await expect(console_.locator('.lp-scene-sub')).toHaveText(/^Step 3 of 4 · S01\.3/);
  await expect(console_.locator('.lp-status .lp-chip.ok')).toHaveText('Audience connected', {
    timeout: 10_000,
  });
  expect(await hashOf(audience)).toBe('#S01.3');
  await page.keyboard.press('PageDown');
  await expect.poll(() => hashOf(audience)).toBe('#S01.4');
  await expect(console_.locator('.lp-scene-sub')).toHaveText(/^Step 4 of 4 · S01\.4/);
  await audience.keyboard.press('PageDown');
  await expect(console_.locator('.lp-scene-sub')).toHaveText(/· S02\.1/);
  await expect.poll(() => hashOf(audience)).toBe('#S02.1');
  await audience.close();
  await console_.getByRole('button', { name: 'Back to the Studio' }).click();
  await page.getByRole('button', { name: 'Start again from the first step' }).click();
  await expect(page.getByText('This browser saved a place from an earlier run')).toHaveCount(0);
  await expect(page.getByText(/^It picks up at/)).toHaveCount(0);
});

test('export the example as one HTML file, with the notes and without', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?example');
  await page.getByRole('tab', { name: 'Export' }).click();
  await expect(
    page.getByText('This copy includes the speaker notes and each step’s cue.', { exact: false }),
  ).toBeVisible();
  await shot(page, 'export-1-workspace');

  const html = async () => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export HTML…' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(
      'global-polycrisis-the-connections-that-change-everything.html',
    );
    return readFileSync((await download.path()) as string, 'utf8');
  };
  const full = await html();
  expect(full).toContain('data-notes="included"');
  await expect(page.getByText(/^Last export: 1\.\d MB, speaker notes included\./)).toBeVisible();

  await page.getByLabel('Include the speaker notes, the script and the cues').uncheck();
  const bare = await html();
  expect(bare).toContain('data-notes="left-out"');
  expect(bare.length).toBeLessThan(full.length);
});

test('the console scrolls in a narrow window (or zoomed in), so every control and scene stays in reach', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto('/?example');
  await page.getByRole('tab', { name: 'Present' }).click();
  await page.getByRole('button', { name: 'Open the console' }).click();
  const console_ = page.getByRole('dialog', { name: 'Presenter console' });
  await expect(console_.locator('.lp-scene-sub')).toHaveText(/S00\.1/);
  const strip = console_.getByRole('navigation', { name: 'Scenes' });
  await expect(strip).not.toBeInViewport();
  // With the mouse wheel, as a person scrolls (a script could scroll even a box that hides its overflow).
  await page.mouse.move(400, 300);
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 500);
  await expect(strip).toBeInViewport();
  await expect(console_.getByRole('button', { name: 'Open audience window' })).toBeInViewport();
  await shot(page, 'present-5-console-narrow');
});

test('the keyboard shortcuts on a short window: the keys scroll them, and move nothing behind them', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 420 });
  await page.goto('/?example');
  await page.getByRole('tab', { name: 'Present' }).click();
  await page.getByRole('button', { name: 'Open the console' }).click();
  const console_ = page.getByRole('dialog', { name: 'Presenter console' });
  const sub = console_.locator('.lp-scene-sub');
  await expect(sub).toHaveText(/^Step 1 of 1 · S00\.1/);
  await page.keyboard.press('?');
  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(help.getByRole('button', { name: 'Close' })).toBeFocused();
  // Taller than the window, the card starts at its top, and the keys scroll it.
  expect(await help.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await expect(help.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeInViewport();
  const scrolled = () => help.evaluate((el) => el.scrollTop);
  await page.keyboard.press('ArrowDown');
  await expect.poll(scrolled).toBeGreaterThan(0);
  const down = await scrolled();
  await page.keyboard.press('PageDown');
  await expect.poll(scrolled).toBeGreaterThan(down);
  await page.keyboard.press('End');
  await expect(help.getByText('Esc or ? closes this')).toBeInViewport();
  await shot(page, 'present-6-help-short');
  // Behind it, the show has not moved.
  await expect(sub).toHaveText(/^Step 1 of 1 · S00\.1/);
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await page.keyboard.press('PageDown');
  await expect(sub).toHaveText(/S01\.1/);
});

test('the console and the rehearsal are modal: Tab stays inside, the Studio is out of reach, the focus comes back', async ({
  page,
}) => {
  await page.goto('/?example');
  await page.getByRole('tab', { name: 'Present' }).click();
  for (const [label, name] of [
    ['Open the console', 'Presenter console'],
    ['Rehearse', 'Rehearsal'],
  ] as const) {
    const opener = page.getByRole('button', { name: label, exact: true });
    await opener.click();
    const dialog = page.getByRole('dialog', { name });
    await expect(dialog).toHaveCount(1);
    await expect(page.locator('#root')).toHaveAttribute('inert', '');
    const inside = () =>
      page.evaluate(
        (n) => document.querySelector(`[role="dialog"][aria-label="${n}"]`)?.contains(document.activeElement),
        name,
      );
    // Back past the first control, then on past the last: round and round, never out of the presentation.
    for (const key of ['Shift+Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
      await page.keyboard.press(key);
      expect(await inside(), `${name}, after ${key}`).toBe(true);
    }
    await dialog.getByRole('button', { name: /^Back to the Studio/ }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('#root')).not.toHaveAttribute('inert', '');
    await expect(opener).toBeFocused();
  }
});

test('the Studio’s audience window says, as a status, that it is waiting for the console', async ({
  page,
}) => {
  await page.goto('/audience.html?show=00000000');
  const waiting = page.getByRole('status');
  await expect(waiting).toHaveText('Waiting for the presenter console in the Studio…');
  await expect(waiting).toHaveText(/Keep the Studio open/, { timeout: 10_000 });
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
});

test('the audience window opened by hand, with no presentation to join, says how to open one', async ({
  page,
}) => {
  await page.goto('/audience.html');
  const waiting = page.getByRole('status');
  await expect(waiting).toContainText(
    'in the Studio, Present, then Open the console, then Open audience window',
  );
  await expect(waiting.getByRole('link', { name: 'Open the Studio' })).toHaveAttribute('href', './');
  // Nothing scrolls: the message sits in the window.
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
});

test('export asks where to save while the click still counts, however long the player takes to load', async ({
  page,
}) => {
  test.setTimeout(90_000);
  // The player's page loads only when exporting: here it takes longer than a click counts (about 5 s).
  let delayed = 0;
  await page.route(/loopweft-player-template/, async (route) => {
    delayed++;
    await new Promise((resolve) => setTimeout(resolve, 9000));
    await route.continue();
  });
  // A save dialog that, like Chrome's and Edge's, refuses once the click no longer counts. The rule is kept
  // here, 5 s after the last click, since a browser under test may keep a click counting longer.
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    const record = { waited: [] as number[], written: '' };
    let clickedAt = Number.NEGATIVE_INFINITY;
    document.addEventListener(
      'click',
      () => {
        clickedAt = performance.now();
      },
      true,
    );
    w.__picker = record;
    w.showSaveFilePicker = async () => {
      const waited = performance.now() - clickedAt;
      record.waited.push(waited);
      if (waited > 5000) throw new DOMException('Must be handling a user gesture.', 'SecurityError');
      return {
        name: 'chosen.html',
        createWritable: async () => ({
          write: async (text: string) => {
            record.written += text;
          },
          close: async () => {},
        }),
      };
    };
  });
  await page.goto('/?example');
  await page.getByRole('tab', { name: 'Export' }).click();
  await page.getByRole('button', { name: 'Export HTML…' }).click();
  await expect(page.getByText(/^Last export: 1\.\d MB, speaker notes included\./)).toBeVisible({
    timeout: 60_000,
  });
  expect(delayed).toBeGreaterThan(0);
  const record = await page.evaluate(
    () => (window as unknown as { __picker: { waited: number[]; written: string } }).__picker,
  );
  expect(record.waited).toHaveLength(1);
  expect(record.waited[0]).toBeLessThan(1000);
  expect(record.written).toContain('data-notes="included"');
});
