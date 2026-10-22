import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { readProject } from '../packages/model/src/index.ts';
import { playerTemplate } from '../packages/player/build/template.ts';
import { exportHtml } from '../packages/player/src/export.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'loopweft-site-'));
afterAll(() => rmSync(out, { recursive: true, force: true }));

describe('the GitHub Pages site', () => {
  // A production build of the Studio and of the player's page (once, for the Studio's Export and for demo/):
  // about 15 s, but three minutes or more on a busy laptop on battery while the other tests run beside them.
  it('builds the landing page', { timeout: 300_000 }, () => {
    const run = spawnSync(process.execPath, ['scripts/build-site.mjs', out], { cwd: root, encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0);
    const page = readFileSync(join(out, 'index.html'), 'utf8');
    expect(page).toContain('<title>Loopweft</title>');
    expect(existsSync(join(out, 'index.html'))).toBe(true);
  });

  it('publishes the JSON Schema where `$schema` points', () => {
    const schema = JSON.parse(readFileSync(join(out, 'schema/v1.json'), 'utf8')) as { $id: string };
    expect(schema.$id).toBe('https://tashiikid.github.io/loopweft/schema/v1.json');
  });

  it('loads nothing from other sites', () => {
    for (const file of ['site/index.html', 'site/agents/index.html']) {
      const page = readFileSync(join(root, file), 'utf8');
      // Links are fine; scripts, stylesheets, fonts and images from elsewhere are not (no tracking, works offline).
      expect(page, file).not.toMatch(
        /<script[^>]+src=|<link[^>]+href="https?:|url\(\s*["']?https?:|<img[^>]+src="https?:/i,
      );
    }
  });

  it('publishes the guide for AI agents at agents/, as `loopweft guide` prints it, beside a page about it', () => {
    expect(readFileSync(join(out, 'agents/SKILL.md'), 'utf8')).toBe(
      readFileSync(join(root, 'docs/agents/SKILL.md'), 'utf8'),
    );
    const page = readFileSync(join(out, 'agents/index.html'), 'utf8');
    expect(page).toContain('<title>Loopweft and AI agents</title>');
    expect(page).toContain('href="SKILL.md"');
    expect(page).toContain('href="../studio/"');
    expect(readFileSync(join(root, 'site/index.html'), 'utf8')).toContain('href="agents/"');
  });

  it('publishes the example at demo/ as one HTML file: the same bytes as its export', async () => {
    const page = readFileSync(join(out, 'demo/index.html'), 'utf8');
    // One file: nothing beside it, nothing from other sites.
    expect(readdirSync(join(out, 'demo'))).toEqual(['index.html']);
    expect(page).not.toMatch(/(?:src|href)=["']\.?\/?assets\//);
    expect(page).not.toMatch(/<script[^>]+src=|<link[^>]+href="https?:/i);
    const read = readProject(readFileSync(join(root, 'examples/polycrisis.loopweft'), 'utf8'));
    if (!read.ok) throw new Error('The example does not open.');
    expect(page).toBe(exportHtml(read.project, await playerTemplate(), { notes: true }).html);
  });

  it('offers the example from the landing page, to open and to download', () => {
    const landing = readFileSync(join(root, 'site/index.html'), 'utf8');
    expect(landing).toContain('href="demo/"');
    expect(landing).toMatch(/href="demo\/index\.html" download="[^"]+\.html"/);
  });
});

describe('the Studio on the site', () => {
  it('is published at studio/, with relative paths, its fonts, and nothing from other sites', () => {
    const page = readFileSync(join(out, 'studio/index.html'), 'utf8');
    expect(page).toContain('<title>Loopweft Studio</title>');
    const assets = [...page.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map((m) => m[1] as string);
    expect(assets.some((a) => a.endsWith('.js'))).toBe(true);
    expect(assets.some((a) => a.endsWith('.css'))).toBe(true);
    for (const asset of assets) expect(existsSync(join(out, 'studio', asset)), asset).toBe(true);
    expect(page).not.toMatch(/<script[^>]+src="https?:|<link[^>]+href="https?:/i);
    const files = readdirSync(join(out, 'studio/assets'));
    expect(files.some((f) => /^inter-latin-opsz-normal-.*\.woff2$/.test(f))).toBe(true);
    const css = files
      .filter((f) => f.endsWith('.css'))
      .map((f) => readFileSync(join(out, 'studio/assets', f), 'utf8'));
    expect(css.join('')).not.toMatch(/url\(\s*["']?https?:/);
  });

  it('has the audience window its presenter console opens, at studio/audience.html', () => {
    const page = readFileSync(join(out, 'studio/audience.html'), 'utf8');
    const assets = [...page.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map((m) => m[1] as string);
    expect(assets.some((a) => a.endsWith('.js'))).toBe(true);
    for (const asset of assets) expect(existsSync(join(out, 'studio', asset)), asset).toBe(true);
  });

  it('is linked from the landing page', () => {
    expect(readFileSync(join(root, 'site/index.html'), 'utf8')).toContain('href="studio/"');
  });
});
