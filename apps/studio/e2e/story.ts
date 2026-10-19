// What the Story workspace's end-to-end tests share: the example, and the way a person reaches its panels,
// tools and lists.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Project, readProject } from '@loopweft/model';
import { expect, type Locator, type Page, test } from '@playwright/test';

export const EXAMPLE = resolve('examples/polycrisis.loopweft');

export const example = (): Project => {
  const parsed = readProject(readFileSync(EXAMPLE, 'utf8'));
  if (!parsed.ok) throw new Error('The example does not open.');
  return parsed.project;
};

/** Saving downloads the file (no file pickers), dialogs are accepted, and a step that cannot be done fails at once. */
export function plainBrowser() {
  test.use({ actionTimeout: 15_000 });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      delete w.showSaveFilePicker;
      delete w.showOpenFilePicker;
    });
    page.on('dialog', (dialog) => void dialog.accept());
  });
}

export const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const side = (page: Page) => page.getByRole('complementary', { name: 'Story panel' });

/** Chooses a step in the story outline (by its key, e.g. "S04.1"). */
export async function chooseStep(page: Page, key: string) {
  await page
    .getByRole('navigation', { name: 'Story outline' })
    .getByRole('button', { name: new RegExp(`^${literal(key)}\\s`) })
    .click();
}

/** Opens the example's story at a step. */
export async function openStep(page: Page, key: string) {
  await page.goto('/?example');
  await page.getByRole('tab', { name: 'Story' }).click();
  await chooseStep(page, key);
}

export async function panel(page: Page, name: string) {
  await side(page).getByRole('tab', { name, exact: true }).click();
}

export async function tool(page: Page, name: string, option?: string) {
  await page.getByRole('radiogroup', { name: 'Record tool' }).getByText(name, { exact: true }).click();
  if (option) await page.getByText(option, { exact: true }).click();
}

/** Opens a section of the Map panel if it is closed, and returns it. */
export async function section(page: Page, name: string): Promise<Locator> {
  const control = side(page).getByRole('button', { name, exact: true });
  if ((await control.getAttribute('aria-expanded')) !== 'true') await control.click();
  const region = side(page).getByRole('region', { name, exact: true });
  // A section opens by growing to its height, clipping what is in it: a list opened in it meanwhile is hidden
  // as soon as it shows. Its height is left to the page once it has opened.
  await expect(region).not.toHaveAttribute('style', /height/);
  return region;
}

/** What a list offered when an option was not there, for the error. */
async function offered(page: Page, field: Locator, option: string): Promise<string> {
  const shown = await page.getByRole('option').allInnerTexts();
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null);
  return `"${option}" is not offered (typed: "${await field.inputValue()}"; list open: ${await field.getAttribute('aria-expanded')}; focus on: ${focused ?? 'the field'}; offered: ${JSON.stringify(shown.slice(0, 8))}).`;
}

/**
 * Chooses an option of a Mantine select by its label, as a person does: a click opens the list; in a
 * searchable one, typing the option's whole name narrows it; then the option is clicked once it shows. A
 * slow machine can miss a step, so a pick that does not find its option closes the list and tries again
 * (three tries), then says what was offered.
 */
export async function choose(page: Page, field: Locator, option: string) {
  const searchable = (await field.getAttribute('readonly')) === null;
  const wanted = page.getByRole('option', { name: option, exact: true });
  for (let attempt = 1; ; attempt++) {
    await field.click();
    if (searchable) await field.fill(option);
    try {
      await expect(wanted).toBeVisible({ timeout: 4000 });
      await wanted.click({ timeout: 4000 });
      return;
    } catch (error) {
      if (attempt === 3) throw new Error(await offered(page, field, option), { cause: error });
      await page.keyboard.press('Escape');
    }
  }
}

/** Types into a field that keeps its value when it is left. */
export async function commit(field: Locator, text: string) {
  await field.fill(text);
  await field.press('Enter');
}

/** Saves the project from the header and reads the file back. */
export async function save(page: Page): Promise<{ text: string; project: Project }> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save', exact: true }).click(),
  ]);
  const text = readFileSync(await download.path(), 'utf8');
  const saved = readProject(text);
  if (!saved.ok) throw new Error(JSON.stringify(saved.issues, null, 2));
  return { text, project: saved.project };
}
