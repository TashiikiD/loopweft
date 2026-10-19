// The Phase 4 checkpoint, end to end in a real browser: recreate polycrisis scenes using only the Studio.
// The example opens, its whole story is removed in the Story workspace, and three of its scenes (S01 "Not a
// perfect storm", S04 "How crises cascade" and S05 "Feedback: the widening lens") are built again by hand:
// scenes and steps added in the outline, what each step shows set with the record view's tools on the stage
// (real pointer clicks) and the Map panel, overlays added in the Overlays panel, notes typed in the Notes panel. The saved file's
// three scenes then equal the example's, field for field, apart from the ids the Studio chose. With
// LOOPWEFT_REVIEW set to a folder, a still of the stage after each step is saved there.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  LEVELS,
  type MapState,
  type Overlay,
  type Project,
  readProject,
  type Scene,
  type Step,
} from '@loopweft/model';
import { expect, type Locator, type Page, test } from '@playwright/test';

const EXAMPLE = resolve('examples/polycrisis.loopweft');
const REVIEW = process.env.LOOPWEFT_REVIEW ? resolve(process.env.LOOPWEFT_REVIEW) : null;
const SCENES = ['S01', 'S04', 'S05'];

const example = (): Project => {
  const parsed = readProject(readFileSync(EXAMPLE, 'utf8'));
  if (!parsed.ok) throw new Error('The example does not open.');
  return parsed.project;
};

// A step that cannot be done fails at once rather than waiting out the whole test.
test.use({ actionTimeout: 15_000 });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.showSaveFilePicker;
    delete w.showOpenFilePicker;
  });
  page.on('dialog', (dialog) => void dialog.accept());
});

const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Clicks one of the record view's targets over the stage (by its accessible name). */
/**
 * Clicks one of the record view's targets on the stage (by its accessible name) with the real pointer, at a
 * point where the target is on top (along a link's curve, or on a variable). A target with no such point
 * fails the test at once. (Playwright's element click measures an SVG path's box with its stroke, so its
 * relative positions miss thin curves; the mouse is given the point on the page instead.)
 */
async function hit(page: Page, name: RegExp, shift = false) {
  const target = page
    .getByRole('group', { name: 'Record: click variables and links' })
    .getByRole('button', { name })
    .first();
  const position = await target.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const points: { x: number; y: number }[] = [];
    if (el instanceof SVGPathElement) {
      const length = el.getTotalLength();
      const matrix = el.getScreenCTM();
      for (const f of [0.5, 0.4, 0.6, 0.3, 0.7, 0.45, 0.55, 0.35, 0.65, 0.25, 0.75, 0.2, 0.8]) {
        const p = el.getPointAtLength(length * f);
        const q = matrix ? new DOMPoint(p.x, p.y).matrixTransform(matrix) : p;
        points.push({ x: q.x, y: q.y });
      }
    } else points.push({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    // Then anywhere in its box, row by row.
    for (let j = 1; j < 12; j++)
      for (let i = 1; i < 12; i++)
        points.push({ x: box.x + (box.width * i) / 12, y: box.y + (box.height * j) / 12 });
    return points.find((p) => document.elementFromPoint(p.x, p.y) === el) ?? null;
  });
  if (!position) throw new Error(`No point of ${name} can be clicked on the stage.`);
  // Real mouse input at that point: the browser hit-tests the click itself, so it reaches the target only if
  // the target is really there (the saved file is compared at the end).
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(position.x, position.y);
  if (shift) await page.keyboard.up('Shift');
}

const side = (page: Page) => page.getByRole('complementary', { name: 'Story panel' });

async function panel(page: Page, name: string) {
  await side(page).getByRole('tab', { name, exact: true }).click();
}

async function tool(page: Page, name: string, option?: string) {
  await page.getByRole('radiogroup', { name: 'Record tool' }).getByText(name, { exact: true }).click();
  if (option) await page.getByText(option, { exact: true }).click();
}

/** Opens a section of the Map panel if it is closed, and returns it. */
async function section(page: Page, name: string): Promise<Locator> {
  const control = side(page).getByRole('button', { name, exact: true });
  if ((await control.getAttribute('aria-expanded')) !== 'true') await control.click();
  return side(page).getByRole('region', { name, exact: true });
}

/** Chooses an option of a Mantine select by its label. */
async function choose(page: Page, field: Locator, option: string) {
  // A searchable select is narrowed by typing the option's whole name, then chosen from the keyboard.
  if ((await field.getAttribute('readonly')) === null) {
    await field.fill(option);
    await expect(page.getByRole('option', { name: option, exact: true })).toHaveCount(1);
    await field.press('ArrowDown');
    await field.press('Enter');
    return;
  }
  await field.click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

/** Types into a field that keeps its value when it is left. */
async function commit(field: Locator, text: string) {
  await field.fill(text);
  await field.press('Enter');
}

/** Sets up what a step's map shows, as a person would: tools on the stage first, then the Map panel. */
async function recreateMap(page: Page, project: Project, map: MapState) {
  const variableName = (id: string) => {
    const v = project.variables.find((x) => x.id === id);
    if (!v) throw new Error(`no variable ${id}`);
    return new RegExp(`^${literal((v.mapLabel ?? v.label).replace(/\n/g, ' '))} \\(variable`);
  };
  const linkName = (id: string) => new RegExp(`^${literal(id)}: `);
  const links = new Set(project.links.map((l) => l.id));
  const name = (id: string) => (links.has(id) ? linkName(id) : variableName(id));

  // What stands out: each level's list, clicked in its order.
  for (const level of LEVELS) {
    const ids = [...(map.variables?.[level] ?? []), ...(map.links?.[level] ?? [])];
    if (!ids.length) continue;
    await tool(
      page,
      'Show',
      { hidden: 'Hide', ghost: 'Ghost', dim: 'Dim', normal: 'Normal', focus: 'Focus', active: 'Active' }[
        level
      ],
    );
    for (const id of map.variables?.[level] ?? []) await hit(page, name(id));
    for (const id of map.links?.[level] ?? []) await hit(page, name(id));
  }
  // Trends, then the camera's subject, then the pulses hop by hop.
  for (const [mark, word] of [
    ['up', '▲ Up'],
    ['down', '▼ Down'],
    ['mixed', '± Mixed'],
  ] as const) {
    const ids = Object.entries(map.trends ?? {})
      .filter(([, t]) => t === mark)
      .map(([id]) => id);
    if (!ids.length) continue;
    await tool(page, 'Trend', word);
    for (const id of ids) await hit(page, variableName(id));
  }
  if (map.pulses) {
    await tool(page, 'Pulse');
    for (const hop of map.pulses.hops) {
      for (const [k, id] of hop.entries()) await hit(page, linkName(id), k > 0);
    }
  }
  await tool(page, 'Look');

  // The rest in the Map panel.
  await panel(page, 'Map');
  const box = side(page);
  if (map.variables?.base) await choose(page, box.getByLabel('Variables not listed'), map.variables.base);
  if (map.links?.base) await choose(page, box.getByLabel('Links not listed'), map.links.base);
  // The camera last, from the Map panel, so every click above was made on the whole map, in view.
  for (const id of map.camera?.fit ?? []) {
    const v = project.variables.find((x) => x.id === id);
    await choose(page, box.getByLabel('Add a variable to frame'), `${v?.label} (${id})`);
  }
  if (map.camera?.frame) await choose(page, box.getByLabel('Where on the stage'), map.camera.frame);
  if (map.camera?.maxZoom !== undefined)
    await commit(box.getByLabel('Zoom at most'), String(map.camera.maxZoom));
  if (map.loops?.length) {
    const loops = await section(page, 'Loop badges');
    for (const id of map.loops)
      await loops.getByRole('checkbox', { name: `Badge ${id}`, exact: true }).check();
    for (const id of map.loopNames ?? [])
      await loops.getByRole('checkbox', { name: `Name ${id}`, exact: true }).check();
  }
  if (map.pulses && (map.pulses.repeat !== undefined || map.pulses.tone || map.pulses.delay !== undefined)) {
    const pulses = await section(page, 'Pulses');
    if (map.pulses.repeat !== undefined)
      await commit(pulses.getByLabel('Extra passes'), String(map.pulses.repeat));
    if (map.pulses.delay !== undefined)
      await commit(pulses.getByLabel('Delay (s)'), String(map.pulses.delay));
    if (map.pulses.tone)
      await choose(
        page,
        pulses.getByLabel('Tone'),
        { harm: 'Harm', relief: 'Relief', mixed: 'Mixed' }[map.pulses.tone],
      );
  }
  if (map.reveal) {
    const reveal = await section(page, 'How new things arrive');
    const r = map.reveal;
    if (r.mode)
      await choose(
        page,
        reveal.getByLabel('New links arrive'),
        r.mode === 'bloom' ? 'Blooming out, ring by ring' : 'Tracing in from their source (default)',
      );
    for (const id of r.from ?? []) {
      const v = project.variables.find((x) => x.id === id);
      await choose(page, reveal.getByLabel('Add a variable it grows from'), `${v?.label} (${id})`);
    }
    if (r.sequence) await commit(reveal.getByLabel(/^Exact order/), r.sequence.join(', '));
    if (r.stagger !== undefined) await commit(reveal.getByLabel('Between beats (s)'), String(r.stagger));
    if (r.delay !== undefined) await commit(reveal.getByLabel('Delay (s)'), String(r.delay));
  }
  if (
    map.labels ||
    map.opacity !== undefined ||
    map.clusters ||
    map.minimap !== undefined ||
    map.categoryLabels
  ) {
    const look = await section(page, 'Labels, halos and minimap');
    if (map.labels)
      await choose(
        page,
        look.getByLabel('Labels', { exact: true }),
        { none: 'None', focus: 'Lit ones', view: 'In view', all: 'All' }[map.labels],
      );
    if (map.opacity !== undefined) await commit(look.getByLabel('Opacity'), String(map.opacity));
    if (map.clusters)
      await choose(
        page,
        look.getByLabel('Group halos'),
        { show: 'Show', dim: 'Dim', hide: 'Hide' }[map.clusters],
      );
    if (map.minimap !== undefined)
      await choose(page, look.getByLabel('Minimap'), map.minimap ? 'Always' : 'Never');
  }
  if (map.labelText) {
    const labels = await section(page, 'Label text for this step');
    for (const [id, text] of Object.entries(map.labelText)) {
      const v = project.variables.find((x) => x.id === id);
      await choose(
        page,
        labels.getByLabel('Give a variable other label text on this step'),
        `${v?.label} (${id})`,
      );
      await commit(labels.getByLabel(`Label of ${id} on this step`), text);
    }
  }
}

async function recreateOverlays(page: Page, overlays: Overlay[]) {
  await panel(page, 'Overlays');
  const box = side(page);
  for (const overlay of overlays) {
    await box.getByRole('button', { name: 'Add', exact: true }).first().click();
    if (overlay.type === 'caption') {
      await page.getByRole('menuitem', { name: 'Caption' }).click();
    } else if (overlay.type === 'statement') {
      await page.getByRole('menuitem', { name: 'Statement' }).click();
      await box.getByLabel('Lines (one per line)').first().fill(overlay.lines.join('\n'));
      await box.getByRole('button', { name: 'Add', exact: true }).last().click();
      const card = box.locator('.lw-overlay-card').last();
      if (overlay.style)
        await choose(
          page,
          card.getByLabel('Style'),
          overlay.style.charAt(0).toUpperCase() + overlay.style.slice(1),
        );
      if (overlay.place) await choose(page, card.getByLabel('Place'), overlay.place);
    } else throw new Error(`The test does not recreate ${overlay.type} overlays.`);
  }
}

/** A screen of the whole Studio, for the review. */
async function shot(page: Page, name: string) {
  if (!REVIEW) return;
  mkdirSync(join(REVIEW, 'flow'), { recursive: true });
  await page.screenshot({ path: join(REVIEW, 'flow', `${name}.png`) });
}

async function still(page: Page, name: string) {
  if (!REVIEW) return;
  mkdirSync(REVIEW, { recursive: true });
  await page
    .locator('[data-testid="story-stage"] .lw-stage')
    .screenshot({ path: join(REVIEW, `${name}.png`) });
}

/**
 * A map state with its defaults left out: the example states some of them (labels "view", a base level of
 * "normal", halos "show"), which the format says mean the same as leaving them out, as the Studio does.
 */
function withoutDefaults(map: MapState): MapState {
  const out = structuredClone(map);
  if (out.labels === 'view') delete out.labels;
  if (out.clusters === 'show') delete out.clusters;
  for (const kind of ['variables', 'links'] as const) {
    const lists = out[kind];
    if (lists?.base === 'normal') delete lists.base;
    if (lists && Object.keys(lists).length === 0) delete out[kind];
  }
  return out;
}

/** A scene without the ids the Studio chooses (toEqual ignores the order of keys, not of lists). */
function comparable(scene: Scene): unknown {
  const { id: _scene, steps, ...rest } = scene;
  return {
    ...rest,
    steps: steps.map(({ id: _step, map, ...step }: Step) => ({ ...step, map: withoutDefaults(map) })),
  };
}

test('recreate polycrisis scenes using only the Studio', async ({ page }) => {
  test.setTimeout(420_000);
  const project = example();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?example');
  await page.getByRole('tab', { name: 'Story' }).click();
  const outline = page.getByRole('navigation', { name: 'Story outline' });
  await expect(outline.getByText('11 scenes, 70 steps')).toBeVisible();

  // Start from the map alone: every scene removed, one by one.
  for (const scene of project.story.scenes) {
    await outline.getByRole('button', { name: `Scene ${scene.id}: more` }).click();
    await page.getByRole('menuitem', { name: 'Remove scene' }).click();
  }
  await expect(outline.getByText('0 scenes, 0 steps')).toBeVisible();
  await shot(page, '1-story-removed');

  for (const [n, sceneId] of SCENES.entries()) {
    const scene = project.story.scenes.find((s) => s.id === sceneId) as Scene;
    const id = `S${n + 1}`;
    await outline.getByRole('button', { name: 'Scene', exact: true }).click();
    await commit(outline.getByRole('textbox', { name: 'Title of the new scene' }), scene.title);
    await panel(page, 'Scene');
    if (scene.headline) await commit(side(page).getByLabel(/^Headline/), scene.headline);
    if (scene.targetSeconds !== undefined)
      await commit(side(page).getByLabel(/^Target time/), String(scene.targetSeconds));
    for (const source of scene.sources) {
      const s = project.sources.find((x) => x.id === source);
      await side(page)
        .getByLabel(/^Also draws on/)
        .click();
      await page
        .getByRole('option', { name: s?.label ? `${s.label} (${s.id})` : (s?.id ?? source), exact: true })
        .click();
    }
    await page.keyboard.press('Escape');
    if (scene.notes) {
      await panel(page, 'Notes');
      await side(page)
        .getByLabel(/^Speaker notes/)
        .fill(scene.notes);
      await side(page)
        .getByLabel(/^Speaker notes/)
        .blur();
    }

    for (const step of scene.steps) {
      await outline.getByRole('button', { name: `Add a step to scene ${id}` }).click();
      const plain = outline.getByRole('radio', { name: 'The whole map, plainly' });
      if (await plain.count()) await plain.check();
      await commit(
        outline.getByRole('textbox', { name: `Label of the new step in scene ${id}` }),
        step.label,
      );
      await panel(page, 'Step');
      if (step.cue) {
        await side(page).getByLabel(/^Cue/).fill(step.cue);
        await side(page).getByLabel(/^Cue/).blur();
      }
      if (step.at !== undefined) await commit(side(page).getByLabel(/^Due at/), String(step.at));
      await recreateMap(page, project, step.map);
      await recreateOverlays(page, step.overlays);
      await still(page, `${sceneId}.${step.id}`);
      const key = `${sceneId}.${step.id}`;
      if (key === 'S01.3') await shot(page, '2-overlays-S01.3');
      if (key === 'S04.4') {
        await tool(page, 'Pulse');
        await shot(page, '3-record-pulse-S04.4');
        await tool(page, 'Show', 'Focus');
        await shot(page, '4-record-show-S04.4');
        await tool(page, 'Look');
      }
      if (key === 'S05.1') {
        await panel(page, 'Map');
        await section(page, 'Loop badges');
        await shot(page, '5-map-panel-S05.1');
      }
      if (key === 'S05.7b') {
        await panel(page, 'Notes');
        await shot(page, '6-notes-S05');
        await panel(page, 'Checks');
        await shot(page, '7-checks');
      }
    }
  }

  // The saved file: the three scenes, as the example has them.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save', exact: true }).click(),
  ]);
  const text = readFileSync(await download.path(), 'utf8');
  const saved = readProject(text);
  if (!saved.ok) throw new Error(JSON.stringify(saved.issues, null, 2));
  if (REVIEW) writeFileSync(join(REVIEW, 'recreated.loopweft'), text);
  expect(saved.project.story.scenes.map((s) => s.id)).toEqual(['S1', 'S2', 'S3']);
  for (const [n, sceneId] of SCENES.entries()) {
    const original = project.story.scenes.find((s) => s.id === sceneId) as Scene;
    expect(comparable(saved.project.story.scenes[n] as Scene), sceneId).toEqual(comparable(original));
  }
  // The map itself is untouched.
  const { story: _a, meta: _b, ...map } = saved.project;
  const { story: _c, meta: _d, ...originalMap } = project;
  expect(map).toEqual(originalMap);
});

test('the record view works from the keyboard', async ({ page }) => {
  const project = example();
  await page.goto('/?example');
  await page.getByRole('tab', { name: 'Story' }).click();
  await page
    .getByRole('navigation', { name: 'Story outline' })
    .getByRole('button', { name: /^S04\.1\s/ })
    .click();
  await tool(page, 'Show', 'Active');
  // From the stage, Tab reaches the first link's target; Enter applies the tool.
  await page.getByRole('region', { name: /^Stage/ }).focus();
  await page.keyboard.press('Tab');
  const first = project.links[0]?.id as string;
  await expect(page.locator(':focus')).toHaveAttribute('aria-label', new RegExp(`^${first}: `));
  await page.keyboard.press('Enter');
  // Past every link, the first variable's target; Space applies the tool.
  for (let i = 0; i < project.links.length; i++) await page.keyboard.press('Tab');
  const variable = project.variables[0];
  if (!variable) throw new Error('the example has no variables');
  await expect(page.locator(':focus')).toHaveAttribute(
    'aria-label',
    new RegExp(`^${literal((variable.mapLabel ?? variable.label).replace(/\n/g, ' '))} \\(variable`),
  );
  await page.keyboard.press(' ');
  await expect(page.locator(':focus')).toHaveAttribute('aria-label', / \(variable, active\)$/);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save', exact: true }).click(),
  ]);
  const saved = readProject(readFileSync(await download.path(), 'utf8'));
  if (!saved.ok) throw new Error(JSON.stringify(saved.issues, null, 2));
  const step = saved.project.story.scenes.find((s) => s.id === 'S04')?.steps.find((s) => s.id === '1');
  expect(step?.map.links?.active).toEqual([first]);
  expect(step?.map.variables?.active).toEqual([variable.id]);
});
