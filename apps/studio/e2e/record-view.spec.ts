// The record view and the Map panel in a real browser: the record view from the keyboard alone (Tab reaches
// the variables and links on the stage, and only those; Enter or Space applies the tool), its keyboard focus
// seen on every stage theme, and a Map panel list searched and chosen from after its section opens.
import { expect, type Page, test } from '@playwright/test';
import {
  choose,
  chooseStep,
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

/** Where keyboard focus is: a record target's name and whether any of it shows on the stage, or null. */
async function focusedTarget(page: Page): Promise<{ label: string; onStage: boolean } | null> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!(el instanceof SVGGeometryElement) || !el.closest('.lw-record-layer')) return null;
    const stage = (el.closest('.lw-stage') as HTMLElement).getBoundingClientRect();
    const scale = stage.width / 1920;
    const inside = (x: number, y: number, pad: number) =>
      x >= stage.left - pad && x <= stage.right + pad && y >= stage.top - pad && y <= stage.bottom + pad;
    let onStage = false;
    if (el instanceof SVGPathElement) {
      // Along the link's curve, counting half its 14-pixel target either side.
      const length = el.getTotalLength();
      const matrix = el.getScreenCTM();
      for (let i = 0; i <= 64 && !onStage; i++) {
        const p = el.getPointAtLength((length * i) / 64);
        const q = matrix ? new DOMPoint(p.x, p.y).matrixTransform(matrix) : p;
        onStage = inside(q.x, q.y, 7 * scale);
      }
    } else {
      const box = el.getBoundingClientRect();
      onStage =
        box.right > stage.left && box.left < stage.right && box.bottom > stage.top && box.top < stage.bottom;
    }
    return { label: el.getAttribute('aria-label') ?? '', onStage };
  });
}

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

test('Tab skips the variables and links off the stage', async ({ page }) => {
  const project = example();
  // S05.1 frames two variables, zoomed in up to 2.2 times: much of the map is off the stage.
  await openStep(page, 'S05.1');
  await tool(page, 'Show', 'Focus');
  const targets = await page.getByRole('group', { name: RECORD }).getByRole('button').count();
  expect(targets).toBe(project.variables.length + project.links.length);
  await page.getByRole('region', { name: /^Stage/ }).focus();
  const reached: string[] = [];
  for (;;) {
    await page.keyboard.press('Tab');
    const at = await focusedTarget(page);
    if (!at) break;
    expect(at.onStage, `Tab reached "${at.label}", which is off the stage`).toBe(true);
    reached.push(at.label);
    expect(reached.length).toBeLessThanOrEqual(targets);
  }
  expect(reached.length).toBeGreaterThan(0);
  expect(reached.length, 'some targets are off the stage at this zoom').toBeLessThan(targets);
  expect(reached.some((label) => label.includes('(variable, '))).toBe(true);
});

/** WCAG's contrast ratio between two colours given as [r, g, b] in 0–255. */
function contrast(a: number[], b: number[]): number {
  const luminance = (c: number[]) => {
    const [r, g, bl] = c.map((v) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** A CSS colour (`#rrggbb`, `rgb(…)` or `rgba(…)`) as [r, g, b] in 0–255 and its alpha. */
const colour = (css: string): { rgb: number[]; alpha: number } => {
  const hex = css.trim().match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hex) return { rgb: hex.slice(1).map((h) => Number.parseInt(h, 16)), alpha: 1 };
  const nums = css.match(/[\d.]+/g)?.map(Number) ?? [];
  if (nums.length < 3) throw new Error(`Not a colour: ${css}`);
  return { rgb: nums.slice(0, 3), alpha: nums[3] ?? 1 };
};

/** How the focused target's ring stands out from the stage behind it: its stroke, at its opacity, on the stage. */
async function focusContrast(page: Page): Promise<number> {
  const style = await page.evaluate(() => {
    const el = document.activeElement as Element;
    const css = getComputedStyle(el);
    const viewport = el.closest('.lw-viewport') as HTMLElement;
    return {
      stroke: css.stroke,
      opacity: Number(css.strokeOpacity),
      stage: getComputedStyle(viewport).getPropertyValue('--lw-bg'),
    };
  });
  const ring = colour(style.stroke);
  const stage = colour(style.stage).rgb;
  const a = ring.alpha * style.opacity;
  return contrast(
    ring.rgb.map((c, i) => a * c + (1 - a) * (stage[i] as number)),
    stage,
  );
}

test('keyboard focus stands out on every stage', async ({ page }) => {
  await openStep(page, 'S04.1');
  for (const stage of ['Dark', 'Light', 'High contrast']) {
    if (stage !== 'Dark') {
      await page.getByLabel('Workspaces').getByRole('tab', { name: 'Map' }).click();
      await page
        .getByRole('complementary', { name: 'Side panel' })
        .getByRole('tab', { name: 'Look' })
        .click();
      await page.getByRole('radiogroup', { name: 'Stage' }).getByText(stage, { exact: true }).click();
      await page.getByRole('tab', { name: 'Story' }).click();
      await chooseStep(page, 'S04.1');
    }
    await tool(page, 'Show', 'Focus');
    await page.getByRole('region', { name: /^Stage/ }).focus();
    // A link's ring, then a variable's: at least 3:1 against the stage (WCAG's contrast for focus rings).
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveAttribute('aria-label', / \(link, /);
    expect(await focusContrast(page), `a link's focus on the ${stage} stage`).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < 400; i++) {
      if ((await page.locator(':focus').getAttribute('aria-label'))?.includes('(variable, ')) break;
      await page.keyboard.press('Tab');
    }
    expect(await focusContrast(page), `a variable's focus on the ${stage} stage`).toBeGreaterThanOrEqual(3);
  }
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
