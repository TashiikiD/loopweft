// The record view and the Map panel in a real browser: the record view from the keyboard alone (Tab reaches
// the variables and links on the stage; Enter or Space applies the tool), and a Map panel list searched and
// chosen from after its section opens.
import { expect, test } from '@playwright/test';
import {
  choose,
  commit,
  example,
  openStep,
  panel,
  plainBrowser,
  save,
  section,
  side,
  tool,
} from './story.ts';

plainBrowser();

const RECORD = 'Record: click variables and links';

test('the record view works from the keyboard', async ({ page }) => {
  const project = example();
  await openStep(page, 'S04.1');
  await tool(page, 'Show', 'Active');
  // From the stage, Tab reaches the first link on the stage; Enter applies the tool.
  const layer = page.getByRole('group', { name: RECORD });
  const firstOnStage = await layer.locator('[tabindex="0"]').first().getAttribute('aria-label');
  await page.getByRole('region', { name: /^Stage/ }).focus();
  await page.keyboard.press('Tab');
  const focused = page.locator(':focus');
  await expect(focused).toHaveAttribute('aria-label', firstOnStage as string);
  const link = (firstOnStage as string).split(':')[0] as string;
  expect(project.links.some((l) => l.id === link)).toBe(true);
  await page.keyboard.press('Enter');
  await expect(focused).toHaveAttribute('aria-label', / \(link, active\)$/);
  // On past the links to the first variable; Space applies the tool.
  for (let i = 0; i < project.links.length; i++) {
    if ((await focused.getAttribute('aria-label'))?.includes('(variable, ')) break;
    await page.keyboard.press('Tab');
  }
  const name = (await focused.getAttribute('aria-label')) as string;
  const variable = project.variables.find((v) =>
    name.startsWith(`${(v.mapLabel ?? v.label).replace(/\n/g, ' ')} (variable, `),
  );
  if (!variable) throw new Error(`Tab reached "${name}", not a variable.`);
  await page.keyboard.press(' ');
  await expect(focused).toHaveAttribute('aria-label', / \(variable, active\)$/);

  const { project: saved } = await save(page);
  const step = saved.story.scenes.find((s) => s.id === 'S04')?.steps.find((s) => s.id === '1');
  expect(step?.map.links?.active).toEqual([link]);
  expect(step?.map.variables?.active).toEqual([variable.id]);
});

test('a Map panel list is searched and chosen from after its section opens', async ({ page }) => {
  const project = example();
  // S01.4 gives no variable label text of its own.
  await openStep(page, 'S01.4');
  await panel(page, 'Map');
  const labels = await section(page, 'Label text for this step');
  const field = labels.getByLabel('Give a variable other label text on this step');
  const picks = [
    ['climate_heating', 'CLIMATE'],
    ['food_insecurity', 'FOOD'],
  ] as const;
  for (const [id, text] of picks) {
    const variable = project.variables.find((v) => v.id === id);
    await choose(page, field, `${variable?.label} (${id})`);
    await expect(field).toHaveValue('');
    await commit(labels.getByLabel(`Label of ${id} on this step`), text);
  }
  // A variable that has label text on this step is no longer offered.
  await field.click();
  await field.fill('Climate heating');
  await expect(
    page.getByRole('option', { name: 'Climate heating (climate_heating)', exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(side(page).getByLabel('Label of climate_heating on this step')).toHaveValue('CLIMATE');

  const { project: saved } = await save(page);
  const step = saved.story.scenes.find((s) => s.id === 'S01')?.steps.find((s) => s.id === '4');
  expect(step?.map.labelText).toEqual({ climate_heating: 'CLIMATE', food_insecurity: 'FOOD' });
});
