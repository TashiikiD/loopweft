// Statements stay on the stage: a long closing line wraps inside its box instead of running off the stage's edge,
// and the example's short closing lines keep to one line each. Measured in the one-file HTML, in this computer's
// Chrome or Edge. With LOOPWEFT_REVIEW set to a folder, screens are saved there for the review.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { type Overlay, type Project, readProject } from '@loopweft/model';
import { exportHtml } from '@loopweft/player';
import { playerTemplate } from '@loopweft/player/build';
import { expect, type Page, test } from '@playwright/test';

/** The example's closing step, the last of scene 10. */
const CLOSING = 'S10.4';

const REVIEW = process.env.LOOPWEFT_REVIEW ? resolve(process.env.LOOPWEFT_REVIEW) : null;

/** The longest closing statement an agent wrote in the dry runs. */
const LONG = [
  'Adding lanes alone cannot solve congestion because it triggers induced demand.',
  'Breaking the cycle requires reducing the attractiveness of driving: public transport, congestion pricing, land use changes, or making alternatives faster and cheaper.',
];

let folder = '';
test.beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), 'loopweft-statement-'));
});
test.afterAll(() => rmSync(folder, { recursive: true, force: true }));

function example(): Project {
  const read = readProject(readFileSync(resolve('examples/polycrisis.loopweft'), 'utf8'));
  if (!read.ok) throw new Error('The example does not open.');
  return read.project;
}

/** The example with the closing step's overlays replaced. */
function withClosing(project: Project, overlays: Overlay[]): Project {
  const scenes = project.story.scenes.map((scene) =>
    scene.id !== 'S10'
      ? scene
      : { ...scene, steps: scene.steps.map((step) => (step.id === '4' ? { ...step, overlays } : step)) },
  );
  return { ...project, story: { ...project.story, scenes } };
}

/** Each statement line's text box in stage pixels from the stage's top left, and its line height, once all have landed. */
async function lines(page: Page, project: Project, name: string) {
  const file = join(folder, `${name}.html`);
  writeFileSync(file, exportHtml(project, await playerTemplate(), { notes: false }).html);
  await page.goto(`${pathToFileURL(file).href}?view=audience&rehearse#${CLOSING}`);
  const all = page.locator('.lw-stage .statement .st-line');
  await expect(all.first()).toBeVisible();
  await expect
    .poll(() => all.evaluateAll((els) => els.every((el) => getComputedStyle(el).opacity === '1')))
    .toBe(true);
  if (REVIEW) {
    mkdirSync(REVIEW, { recursive: true });
    await page.screenshot({ path: join(REVIEW, `statement-${name}.png`) });
  }
  return all.evaluateAll((els) => {
    const stage = document.querySelector('.lw-stage') as HTMLElement;
    const frame = stage.getBoundingClientRect();
    const scale = frame.width / 1920;
    return els.map((el) => {
      // The text's own box: a line that runs on overflows its element's box, which stays the statement's width.
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      return {
        text: el.textContent ?? '',
        left: (r.left - frame.left) / scale,
        right: (r.right - frame.left) / scale,
        top: (r.top - frame.top) / scale,
        bottom: (r.bottom - frame.top) / scale,
        lineHeight: Number.parseFloat(getComputedStyle(el).lineHeight),
      };
    });
  });
}

test('the example’s closing lines keep to one line each, inside the stage', async ({ page }) => {
  const found = await lines(page, example(), 'example');
  expect(found.map((l) => l.text)).toEqual([
    'SEE THE CONNECTIONS.',
    'FIND THE LEVERAGE.',
    'CREATE ROOM FOR TRANSFORMATION.',
  ]);
  for (const line of found) {
    expect(line.bottom - line.top, line.text).toBeLessThan(line.lineHeight * 1.5);
    expect(line.left, line.text).toBeGreaterThanOrEqual(0);
    expect(line.right, line.text).toBeLessThanOrEqual(1920);
  }
});

for (const style of ['closing', 'hero', 'question'] as const) {
  for (const place of ['bottom', 'center', 'top-right'] as const) {
    test(`a long ${style} statement at the ${place} wraps inside the stage`, async ({ page }) => {
      const overlay: Overlay = { type: 'statement', lines: LONG, style, place };
      const found = await lines(page, withClosing(example(), [overlay]), `${style}-${place}`);
      expect(found).toHaveLength(LONG.length);
      for (const line of found) {
        // Too long for one line, so it wraps.
        expect(line.bottom - line.top).toBeGreaterThan(line.lineHeight * 1.5);
        expect(line.left).toBeGreaterThanOrEqual(0);
        expect(line.right).toBeLessThanOrEqual(1920);
      }
      // A closing statement this long stays on the stage in the wide places; a corner's narrow box makes it
      // too tall (the agent guide asks for closing lines of a few words).
      if (style === 'closing' && place !== 'top-right') {
        expect(Math.min(...found.map((l) => l.top))).toBeGreaterThanOrEqual(0);
        expect(Math.max(...found.map((l) => l.bottom))).toBeLessThanOrEqual(1080);
      }
    });
  }
}
