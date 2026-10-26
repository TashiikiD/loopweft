// The Phase 3 checkpoint, end to end in a real browser: cite a map. Six links of the polycrisis example's
// food, livelihoods and unrest cluster are typed in, their three sources added (two by DOI lookup, one by
// hand while offline), and every link and variable cited as the example cites it; the saved file is read
// back. Crossref and DataCite answer from the replies recorded for the model's tests; every other request
// that would leave this computer is refused, and the only one made is the lookup tried while offline. With
// LOOPWEFT_REVIEW set to a folder, screens of the flow are saved there for the review.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { evidenceCoverage, readProject, validateProject } from '@loopweft/model';
import { expect, type Page, type Route, test } from '@playwright/test';

const FIXTURES = resolve('packages/model/test/fixtures');
const EXAMPLE = resolve('examples/polycrisis.loopweft');
const REVIEW = process.env.LOOPWEFT_REVIEW ? resolve(process.env.LOOPWEFT_REVIEW) : null;

async function shot(page: Page, name: string) {
  if (!REVIEW) return;
  mkdirSync(REVIEW, { recursive: true });
  await page.screenshot({ path: join(REVIEW, `${name}.png`) });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.showSaveFilePicker;
    delete w.showOpenFilePicker;
  });
});

/**
 * Answers a Crossref or DataCite request from their recorded replies, as they would (both allow browser
 * requests); a DOI with no recorded reply is one the agency has no record of.
 */
async function crossref(route: Route) {
  const url = new URL(route.request().url());
  const agency = url.hostname === 'api.datacite.org' ? 'datacite' : 'crossref';
  const doi = decodeURIComponent(url.pathname.replace(/^\/(works|dois)\//, ''));
  const file = join(FIXTURES, agency, `${doi.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.json`);
  const headers = { 'access-control-allow-origin': '*' };
  if (!existsSync(file)) {
    await route.fulfill({ status: 404, body: 'Not found', headers });
    return;
  }
  const body = JSON.parse(readFileSync(file, 'utf8')) as { status: unknown; text?: string };
  if (typeof body.status === 'number') {
    await route.fulfill({ status: body.status, body: body.text ?? '', headers });
    return;
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers });
}

const LOOKUP = /^https:\/\/api\.(crossref\.org\/works|datacite\.org\/dois)\//;

const SHORTHAND = [
  'Economic insecurity -> Food insecurity (+)',
  'Food insecurity -> Economic insecurity (+)',
  'Food insecurity -> Civil unrest and violence (+)',
  'Civil unrest and violence -> Food insecurity (+)',
  'Economic insecurity -> Civil unrest and violence (+)',
  'Food insecurity -> Forced displacement (+)',
].join('\n');

/** Chooses rows of the Coverage table by their names, then cites a source on them. */
async function citeChosen(page: Page, rows: string[], source: RegExp, pages: string) {
  for (const row of rows) await page.getByRole('checkbox', { name: `Choose ${row}`, exact: true }).check();
  await page.getByRole('combobox', { name: /^Cite a source/ }).click();
  await page.getByRole('option', { name: source }).click();
  await page.locator('.lw-cite-form').getByRole('textbox', { name: 'Pages' }).fill(pages);
  await page.getByRole('button', { name: 'Cite', exact: true }).click();
}

/** Clicks one choice of a segmented control by its label (its radio input is hidden). */
const segment = (page: Page, label: string) =>
  page.locator('.mantine-SegmentedControl-label').getByText(label, { exact: true }).click();

const link = (from: string, to: string) => `${from} → ${to} (+)`;

test('cite a map end to end', async ({ page, context }) => {
  const example = readProject(readFileSync(EXAMPLE, 'utf8'));
  if (!example.ok) throw new Error('the example does not read');
  const richards = example.project.sources.find((s) => s.id === 'RI');
  if (!richards) throw new Error('no RI in the example');

  // Nothing leaves this computer: Crossref is answered from recorded replies, anything else is refused.
  const outside: string[] = [];
  await page.route(/^https?:\/\/(?!localhost[:/])/, (route) => {
    outside.push(route.request().url());
    return route.abort();
  });
  await page.route(LOOKUP, crossref);

  await page.goto('/');
  await page.getByRole('button', { name: 'Untitled map (rename)' }).click();
  await page.getByRole('textbox', { name: 'Map title' }).fill('Food, livelihoods and unrest');
  await page.keyboard.press('Enter');
  await page
    .getByRole('textbox', { name: 'Description' })
    .fill(
      'Six links of the polycrisis example, cited as the example cites them. A test map: the one strength given was set for the test, not assessed.',
    );
  await page.keyboard.press('Control+Enter');

  await page.getByRole('tab', { name: 'Shorthand' }).click();
  await page.getByRole('textbox', { name: 'Shorthand' }).fill(SHORTHAND);
  await page.getByRole('button', { name: 'Add 6 links' }).click();
  await page.getByRole('tab', { name: 'Layout' }).click();
  await page.getByRole('radio', { name: /^Force/ }).check({ force: true });
  await page.getByRole('button', { name: 'Lay out the map' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Inspector' }).click();
  await expect(page.getByText('0 of 6 links cite a source · 0 sources')).toBeVisible();
  await shot(page, '01-map-uncited');

  // Sources: two by DOI lookup, with the draft and its notes shown before adding.
  await page.getByRole('tab', { name: 'Sources' }).click();
  await shot(page, '02-sources-empty');
  const dialog = page.getByRole('dialog', { name: 'Add a source' });
  const lookUp = async (doi: string, id: string) => {
    await page.getByRole('button', { name: 'Add a source' }).click();
    await dialog.getByRole('textbox', { name: 'DOI' }).fill(doi);
    await dialog.getByRole('button', { name: 'Look up' }).click();
    await expect(dialog.getByRole('textbox', { name: 'Id' })).toBeVisible();
    await dialog.getByRole('textbox', { name: 'Id' }).fill(id);
  };
  await lookUp('https://doi.org/10.1017/sus.2024.1', 'L');
  await expect(dialog.getByText(/Crossref records a correction to this work/)).toBeVisible();
  await shot(page, '03-lookup-draft');
  await dialog.getByRole('button', { name: 'Add source' }).click();
  await lookUp('10.1017/sus.2025.10026', 'S');
  await dialog.getByRole('button', { name: 'Add source' }).click();

  // Offline, the lookup says so, and the reference goes in by hand.
  await page.unroute(LOOKUP, crossref);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Add a source' }).click();
  await dialog.getByRole('textbox', { name: 'DOI' }).fill('10.1007/s10584-021-02957-w');
  await dialog.getByRole('button', { name: 'Look up' }).click();
  await expect(dialog.getByText(/Could not reach Crossref/)).toBeVisible();
  await shot(page, '04-offline');
  await dialog.getByRole('button', { name: 'Enter it by hand' }).click();
  await expect(dialog.getByRole('textbox', { name: 'DOI' })).toHaveValue('10.1007/s10584-021-02957-w');
  await dialog.getByRole('textbox', { name: /^Reference \(APA 7\)/ }).fill(richards.apa);
  await dialog.getByRole('textbox', { name: 'In-text label' }).fill(richards.label ?? '');
  await dialog.getByRole('textbox', { name: 'Id' }).fill('RI');
  await dialog.getByRole('textbox', { name: 'Licence' }).fill('CC BY 4.0');
  await shot(page, '05-by-hand');
  await dialog.getByRole('button', { name: 'Add source' }).click();
  await context.setOffline(false);
  await page.route(LOOKUP, crossref);
  await expect(page.getByRole('heading', { name: 'Richards, Lupton and Allwood (2021)' })).toBeVisible();
  await shot(page, '06-library');

  // Coverage: cite the links, several at a time, at the example's pages.
  await segment(page, 'Coverage');
  await shot(page, '07-coverage-uncited');
  const E033 = link('Economic insecurity', 'Food insecurity');
  const E034 = link('Food insecurity', 'Economic insecurity');
  const E093 = link('Food insecurity', 'Civil unrest and violence');
  const E097 = link('Civil unrest and violence', 'Food insecurity');
  const E094 = link('Economic insecurity', 'Civil unrest and violence');
  const E100 = link('Food insecurity', 'Forced displacement');
  await citeChosen(page, [E033, E034], /^Lawrence et al\. \(2024\)/, '8');
  await citeChosen(page, [E094], /^Lawrence et al\. \(2024\)/, '5');
  await citeChosen(page, [E093, E097, E100], /^Richards, Lupton and Allwood \(2021\)/, '14');
  // Just cited, they stay in the list (to cite another source on them at once) until it is left.
  await expect(page.getByText(/^Just cited: they stay here/)).toBeVisible();
  await expect(page.getByRole('checkbox', { name: `Choose ${E033}`, exact: true })).toBeVisible();
  await segment(page, 'All');
  await segment(page, 'Citing nothing');
  await expect(page.getByText('Every one of the 6 links cites a source.')).toBeVisible();
  await segment(page, 'All');
  await citeChosen(page, [E093, E100], /^Richards, Lupton and Allwood \(2021\)/, '10');
  await shot(page, '08-coverage-links');

  // The variables: three in one go from the coverage view, one in the inspector.
  await segment(page, 'Variables');
  await citeChosen(page, ['Economic insecurity', 'Food insecurity'], /^Lawrence et al\. \(2024\)/, '8');
  await citeChosen(page, ['Economic insecurity', 'Forced displacement'], /^Scheffran \(2025\)/, '11');
  await segment(page, 'Citing nothing');
  await page
    .getByRole('row', { name: /Civil unrest and violence/ })
    .getByRole('button', { name: 'Show on map' })
    .click();

  await page.getByRole('combobox', { name: /^Cite a source/ }).click();
  await page.getByRole('option', { name: /^Richards, Lupton and Allwood \(2021\)/ }).click();
  await page.locator('.lw-cite-form').getByRole('textbox', { name: 'Pages' }).fill('14');
  await segment(page, 'Moderate');
  await page.getByRole('button', { name: 'Cite', exact: true }).click();
  await page.getByRole('combobox', { name: /^Cite a source/ }).click();
  await page.getByRole('option', { name: /^Lawrence et al\. \(2024\)/ }).click();
  await page.locator('.lw-cite-form').getByRole('textbox', { name: 'Pages' }).fill('10');
  await page.getByRole('button', { name: 'Cite', exact: true }).click();
  await expect(page.locator('.lw-citation')).toHaveCount(2);
  await shot(page, '09-inspector-citations');

  await page.keyboard.press('Escape');
  await expect(page.getByText('6 of 6 links cite a source · 3 sources')).toBeVisible();
  await expect(page.getByText('The checks find nothing to look at.')).toBeVisible();
  await shot(page, '10-map-cited');

  await page.getByRole('tab', { name: 'Sources' }).click();
  await segment(page, 'Coverage');
  await expect(page.getByText('4 of 4 cite a source')).toBeVisible();
  await shot(page, '11-coverage-done');
  await segment(page, 'Reference list');
  await expect(page.getByRole('list', { name: 'References' }).locator(':scope > li')).toHaveCount(3);
  await shot(page, '12-reference-list');

  // The structure around the evidence: the paths from economic insecurity to displacement, the hubs.
  await page.getByRole('tab', { name: 'Map' }).click();
  await page.getByRole('tab', { name: 'Paths' }).click();
  await page.getByRole('combobox', { name: 'From' }).click();
  await page.getByRole('option', { name: 'Economic insecurity' }).click();
  await page.getByRole('combobox', { name: 'To' }).click();
  await page.getByRole('option', { name: 'Forced displacement' }).click();
  await expect(page.getByRole('status', { name: 'Paths found' })).toHaveText(
    '2 paths lead from Economic insecurity to Forced displacement: 2 +. The shortest has 2 links.',
  );
  await page.getByRole('button', { name: 'Select these 2 on the map' }).click();
  await shot(page, '13-paths');
  await page.getByRole('tab', { name: 'Connected' }).click();
  await expect(page.getByText(/^Connected does not mean leverage\./)).toBeVisible();
  await shot(page, '14-connected');

  // The saved file holds every citation, as the example has them.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save', exact: true }).click(),
  ]);
  const saved = readProject(readFileSync(await download.path(), 'utf8'));
  if (!saved.ok) throw new Error(JSON.stringify(saved.issues, null, 2));
  const project = saved.project;
  expect(validateProject(project).filter((i) => i.severity === 'warning')).toEqual([]);
  expect(project.sources.map((s) => s.id)).toEqual(['L', 'S', 'RI']);
  expect(project.sources.find((s) => s.id === 'RI')).toEqual({
    id: 'RI',
    label: richards.label,
    apa: richards.apa,
    doi: '10.1007/s10584-021-02957-w',
    licence: 'CC BY 4.0',
  });
  // The lookup gives the example's reference for L word for word.
  expect(project.sources[0]?.apa).toBe(example.project.sources.find((s) => s.id === 'L')?.apa);
  expect(Object.fromEntries(project.links.map((l) => [`${l.from}>${l.to}`, l.citations]))).toEqual({
    'economic_insecurity>food_insecurity': [{ source: 'L', pages: '8' }],
    'food_insecurity>economic_insecurity': [{ source: 'L', pages: '8' }],
    'food_insecurity>civil_unrest_and_violence': [
      { source: 'RI', pages: '14' },
      { source: 'RI', pages: '10' },
    ],
    'civil_unrest_and_violence>food_insecurity': [{ source: 'RI', pages: '14' }],
    'economic_insecurity>civil_unrest_and_violence': [{ source: 'L', pages: '5' }],
    'food_insecurity>forced_displacement': [
      { source: 'RI', pages: '14' },
      { source: 'RI', pages: '10' },
    ],
  });
  expect(Object.fromEntries(project.variables.map((v) => [v.id, v.citations]))).toEqual({
    economic_insecurity: [
      { source: 'L', pages: '8' },
      { source: 'S', pages: '11' },
    ],
    food_insecurity: [{ source: 'L', pages: '8' }],
    civil_unrest_and_violence: [
      { source: 'RI', pages: '14', strength: 'moderate' },
      { source: 'L', pages: '10' },
    ],
    forced_displacement: [{ source: 'S', pages: '11' }],
  });
  const coverage = evidenceCoverage(project);
  expect([coverage.links.uncited, coverage.variables.uncited]).toEqual([[], []]);
  // The only request for anything outside: the lookup tried while offline, refused as offline it would fail.
  expect(outside).toEqual(['https://api.crossref.org/works/10.1007%2Fs10584-021-02957-w']);
});
