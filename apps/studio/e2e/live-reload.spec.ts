// Live reload, end to end: a map open in the Studio follows what the command line does to its file, as an AI
// agent would change it. The browser's file chooser cannot be driven, so the Studio is handed a stand-in for
// the file it would give (a handle that reads and writes the real file on disk through the test); everything
// else is real: the file, the `loopweft` commands that change it, and the Studio looking at it once a second.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readProject } from '@loopweft/model';
import { expect, type Page, test } from '@playwright/test';

const CLI = resolve('packages/cli/bin/loopweft.mjs');
const REVIEW = process.env.LOOPWEFT_REVIEW ? resolve(process.env.LOOPWEFT_REVIEW) : null;

/** Saves a screen for the review, when asked to. */
async function shot(page: Page, name: string) {
  if (!REVIEW) return;
  mkdirSync(REVIEW, { recursive: true });
  await page.screenshot({ path: join(REVIEW, `${name}.png`) });
}
let dir = '';
let file = '';

test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'loopweft-live-'));
  file = join(dir, 'garden.loopweft');
});
test.afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Runs a `loopweft` command on the map, as an agent would. */
function loopweft(...args: string[]) {
  const result = spawnSync(process.execPath, [CLI, ...args.map((a) => (a === 'MAP' ? file : a))], {
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`loopweft ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
}

/** The map on the canvas, named for its counts ("The map: 4 variables and 5 links"). */
const canvas = (page: Page) => page.getByRole('img', { name: /^The map:/ });
const label = (page: Page, text: string) => canvas(page).getByText(text, { exact: true });

const onDisk = () => {
  const read = readProject(readFileSync(file, 'utf8'));
  if (!read.ok) throw new Error('the file does not read as a map');
  return read.project;
};

/** Gives the Studio a file chooser that picks the test's file, and opens it through File > Open. */
async function openInStudio(page: Page) {
  await page.exposeFunction('lwTestRead', () => {
    const stat = statSync(file);
    return {
      text: readFileSync(file, 'utf8'),
      lastModified: Math.floor(stat.mtimeMs),
      name: 'garden.loopweft',
    };
  });
  await page.exposeFunction('lwTestWrite', (text: string) => writeFileSync(file, text));
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown> & {
      lwTestRead(): Promise<{ text: string; lastModified: number; name: string }>;
      lwTestWrite(text: string): Promise<void>;
    };
    delete w.showSaveFilePicker;
    const handle = {
      kind: 'file',
      name: 'garden.loopweft',
      async getFile() {
        const { text, lastModified, name } = await w.lwTestRead();
        return new File([text], name, { lastModified });
      },
      async createWritable() {
        let text = '';
        return {
          async write(data: string) {
            text += data;
          },
          async close() {
            await w.lwTestWrite(text);
          },
        };
      },
    };
    w.showOpenFilePicker = async () => [handle];
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: /Open/ }).click();
  await expect(page.locator('[data-node="efforts"]')).toBeVisible();
}

test('a change the command line makes appears in the open map, as one step in Undo', async ({ page }) => {
  loopweft('new', 'MAP', '--template', 'limits-to-growth', '--title', 'Garden');
  await openInStudio(page);

  loopweft('var', 'set', 'MAP', 'efforts', '--label', 'Invitations from members');
  loopweft('add', 'MAP', '--shorthand', 'Garden members -> Shortage of plots (+)');
  await expect(page.getByText(/Updated from the file/)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-node="garden_members"]')).toBeVisible();
  await expect(label(page, 'Invitations from members')).toBeVisible();
  await shot(page, 'live-reload-1-updated');
  await expect(canvas(page)).toHaveAccessibleName('The map: 6 variables and 6 links');
  await expect(page.getByLabel(/^Save status/)).toHaveAccessibleName('Save status: Saved · garden.loopweft');

  // Undo goes back to the map as it was; the file keeps the agent's change, so the map now differs from it.
  await page.keyboard.press('Control+z');
  await expect(page.locator('[data-node="garden_members"]')).toHaveCount(0);
  await expect(label(page, 'Efforts')).toBeVisible();
  await expect(page.getByLabel(/^Save status/)).toHaveAccessibleName('Save status: Unsaved changes');
  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator('[data-node="garden_members"]')).toBeVisible();
});

test('with unsaved changes of its own, the Studio asks which version to keep', async ({ page }) => {
  loopweft('new', 'MAP', '--template', 'limits-to-growth', '--title', 'Garden');
  await openInStudio(page);

  // An unsaved change in the Studio: the map's title.
  await page.getByRole('button', { name: 'Garden (rename)' }).click();
  await page.getByLabel('Map title').fill('Garden, edited here');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Garden, edited here (rename)' })).toBeVisible();

  loopweft('link', 'add', 'MAP', '--from', 'constraint', '--to', 'efforts', '--sign', '?');
  const banner = page.getByRole('alert').filter({ hasText: 'changed' });
  await expect(banner).toBeVisible({ timeout: 10_000 });
  await expect(banner).toContainText('1 link added');
  await shot(page, 'live-reload-2-which-version');

  // The file's version: the agent's link arrives; the Studio's own title is one Undo away.
  await banner.getByRole('button', { name: "Use the file's version" }).click();
  await expect(canvas(page)).toHaveAccessibleName('The map: 4 variables and 6 links');
  await expect(page.getByRole('button', { name: 'Garden (rename)' })).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('button', { name: 'Garden, edited here (rename)' })).toBeVisible();
  await expect(canvas(page)).toHaveAccessibleName('The map: 4 variables and 5 links');

  // Keep mine: Save asks before it replaces the file's newer content.
  loopweft('link', 'rm', 'MAP', 'L6');
  await expect(banner).toBeVisible({ timeout: 10_000 });
  await banner.getByRole('button', { name: 'Keep mine' }).click();
  const save = async () => {
    const [dialog] = await Promise.all([page.waitForEvent('dialog'), page.keyboard.press('Control+s')]);
    expect(dialog.message()).toContain('has changed since the Studio last read it');
    return dialog;
  };
  await (await save()).dismiss();
  await page.waitForTimeout(500);
  expect(onDisk().meta.title).toBe('Garden');
  await (await save()).accept();
  await expect.poll(() => onDisk().meta.title).toBe('Garden, edited here');
});

test('a file that stops reading as a map leaves the last good one, until it reads again', async ({
  page,
}) => {
  loopweft('new', 'MAP', '--template', 'limits-to-growth', '--title', 'Garden');
  await openInStudio(page);
  const good = readFileSync(file, 'utf8');
  writeFileSync(file, good.replace('"links"', '"lnks"'));
  await expect(page.getByText(/cannot be read now/)).toBeVisible({ timeout: 10_000 });
  await shot(page, 'live-reload-3-unreadable');
  await expect(label(page, 'Efforts')).toBeVisible();
  writeFileSync(file, good.replace('"Efforts"', '"Invitations"'));
  await expect(label(page, 'Invitations')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/cannot be read now/)).toHaveCount(0);
});
