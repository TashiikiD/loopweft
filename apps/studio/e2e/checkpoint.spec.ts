// The Phase 2 checkpoint, end to end in a real browser: build an archetype map from scratch, import a Kumu
// map, and import a DataViz project; each map is saved and the saved file is read back. With
// LOOPWEFT_REVIEW set to a folder, screens of each flow are saved there for the review.
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readProject } from '@loopweft/model';
import { expect, type Page, test } from '@playwright/test';

const FIXTURES = resolve('packages/model/test/fixtures/import');
const REVIEW = process.env.LOOPWEFT_REVIEW ? resolve(process.env.LOOPWEFT_REVIEW) : null;

/** Saves a screen for the review, when asked to. */
async function shot(page: Page, name: string) {
  if (!REVIEW) return;
  mkdirSync(REVIEW, { recursive: true });
  await page.screenshot({ path: join(REVIEW, `${name}.png`) });
}

// Saving goes through a download: the browser's own save dialog (File System Access) cannot be driven.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.showSaveFilePicker;
    delete w.showOpenFilePicker;
  });
});

/** Saves the map and reads the file back. */
async function save(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save', exact: true }).click(),
  ]);
  const read = readProject(readFileSync(await download.path(), 'utf8'));
  if (!read.ok) throw new Error(JSON.stringify(read.issues, null, 2));
  return read.project;
}

/** A variable's glyph centre on the screen. */
async function centre(page: Page, id: string) {
  const box = await page.locator(`[data-node="${id}"] .hit`).boundingBox();
  if (!box) throw new Error(`no variable ${id} on the canvas`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Drags from a variable's handle ring to another variable, and chooses the sign. */
async function link(page: Page, from: string, to: string, sign: '+ rises too' | '− falls') {
  const a = await centre(page, from);
  const b = await centre(page, to);
  await page.mouse.move(a.x, a.y);
  const ring = await page.locator(`[data-handle="${from}"]`).boundingBox();
  if (!ring) throw new Error(`no handle on ${from}`);
  await page.mouse.move(ring.x + ring.width - 1, ring.y + ring.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
  await page
    .getByRole('dialog', { name: 'The sign of the link' })
    .getByRole('button', { name: sign })
    .click();
}

test('build an archetype map from scratch: fixes that fail', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Untitled map (rename)' }).click();
  await page.getByRole('textbox', { name: 'Map title' }).fill('Fixes that fail, drawn by hand');
  await page.keyboard.press('Enter');

  // Three variables, each added where the canvas is double-clicked.
  const canvas = await page.locator('.lw-canvas').boundingBox();
  if (!canvas) throw new Error('no canvas');
  const at = (fx: number, fy: number) => ({
    x: canvas.x + canvas.width * fx,
    y: canvas.y + canvas.height * fy,
  });
  for (const [name, p] of [
    ['Problem symptom', at(0.3, 0.3)],
    ['Fix', at(0.7, 0.3)],
    ['Unintended consequence', at(0.5, 0.75)],
  ] as const) {
    await page.mouse.dblclick(p.x, p.y);
    await page.getByRole('textbox', { name: 'Name of the new variable' }).fill(name);
    await page.keyboard.press('Enter');
  }
  await expect(page.getByRole('img', { name: 'The map: 3 variables and 0 links' })).toBeVisible();
  await shot(page, 'build-1-variables');

  // Two links drawn on the canvas, each sign chosen as it is drawn.
  await link(page, 'problem_symptom', 'fix', '+ rises too');
  await link(page, 'fix', 'problem_symptom', '− falls');
  await shot(page, 'build-2-links-drawn');

  // The rest typed as shorthand.
  await page.getByRole('tab', { name: 'Shorthand' }).click();
  await page
    .getByRole('textbox', { name: 'Shorthand' })
    .fill('Fix -> Unintended consequence (+, delay)\nUnintended consequence -> Problem symptom (+)');
  await expect(page.getByText(/^2 links · 0 new variables/)).toBeVisible();
  await shot(page, 'build-3-shorthand');
  await page.getByRole('button', { name: 'Add 2 links' }).click();
  await expect(page.getByRole('img', { name: 'The map: 3 variables and 4 links' })).toBeVisible();

  // Its two loops, found and named.
  await page.getByRole('tab', { name: 'Loops' }).click();
  await page.getByRole('button', { name: 'Find loops' }).click();
  await expect(page.getByText('2 loops: 1 reinforcing, 1 balancing.')).toBeVisible();
  for (const [path, name] of [
    ['Fix → Problem symptom → Fix', 'The fix eases the symptom'],
    ['Fix → Unintended consequence → Problem symptom → Fix', 'The consequence brings it back'],
  ] as const) {
    const row = page.locator('.mantine-Paper-root').filter({ hasText: path }).last();
    await row.getByRole('button', { name: 'Name this loop' }).click();
    await page.getByRole('textbox', { name: 'Name of the loop' }).fill(name);
    await page.keyboard.press('Enter');
  }
  await expect(page.getByText('Named loops (2)')).toBeVisible();
  await shot(page, 'build-4-loops');

  const project = await save(page);
  expect(project.meta.title).toBe('Fixes that fail, drawn by hand');
  expect(project.variables.map((v) => v.label)).toEqual(['Problem symptom', 'Fix', 'Unintended consequence']);
  expect(project.links.map((l) => `${l.from}>${l.to}${l.sign}${l.delay ? ' delay' : ''}`)).toEqual([
    'problem_symptom>fix+',
    'fix>problem_symptom-',
    'fix>unintended_consequence+ delay',
    'unintended_consequence>problem_symptom+',
  ]);
  expect(project.loops.map((l) => `${l.id} ${l.name}`)).toEqual([
    'B1 The fix eases the symptom',
    'R1 The consequence brings it back',
  ]);
});

/** Imports a file through the wizard: chosen, read, checked, opened. */
async function importFile(page: Page, file: string, kind: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Import a table, Kumu or DataViz file…' }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Choose a file…' }).click(),
  ]);
  await chooser.setFiles(join(FIXTURES, file));
  await expect(page.getByText(kind, { exact: true })).toBeVisible();
}

test('import a Kumu map', async ({ page }) => {
  await importFile(
    page,
    'kumu-blueprint.json',
    'A Kumu map (a JSON blueprint): 4 elements and 5 connections.',
  );
  await shot(page, 'kumu-1-file');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('combobox', { name: 'Signs come from' })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  const notes = page.getByRole('list', { name: 'What the import says' });
  await expect(notes).toContainText('Signs came from the connection field "Polarity".');
  await expect(notes).toContainText('undirected');
  await shot(page, 'kumu-2-check');
  await page.getByRole('button', { name: 'Open the imported map' }).click();
  await expect(page.getByRole('dialog', { name: 'Import a map' })).toBeHidden();
  await expect(page.getByRole('img', { name: 'The map: 4 variables and 5 links' })).toBeVisible();
  await shot(page, 'kumu-3-map');

  const project = await save(page);
  expect(project.variables.map((v) => v.label)).toEqual([
    'Workload',
    'Stress',
    'Sleep quality',
    'Performance',
  ]);
  expect(project.links).toHaveLength(5);
  expect(project.types.categories.map((c) => c.name)).toEqual(['Work', 'Health']);
});

test('import a DataViz project', async ({ page }) => {
  await importFile(page, 'garden.dataviz.json', 'A DataViz project.');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('list', { name: 'What the import says' })).toBeVisible();
  await shot(page, 'dataviz-1-check');
  await page.getByRole('button', { name: 'Open the imported map' }).click();
  await expect(page.getByRole('dialog', { name: 'Import a map' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Garden (test data) (rename)' })).toBeVisible();
  await shot(page, 'dataviz-2-map');
  // The same map as a table.
  await page.getByText('Table', { exact: true }).click();
  await expect(page.getByRole('grid', { name: 'Variables' })).toBeVisible();
  await shot(page, 'dataviz-3-table');

  const project = await save(page);
  expect(project.meta.title).toBe('Garden (test data)');
  expect(project.variables.length).toBeGreaterThan(0);
  expect(project.links.length).toBeGreaterThan(0);
});
