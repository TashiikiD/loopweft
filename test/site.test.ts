import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'loopweft-site-'));
afterAll(() => rmSync(out, { recursive: true, force: true }));

describe('the GitHub Pages site', () => {
  it('builds the landing page', () => {
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
    const page = readFileSync(join(root, 'site/index.html'), 'utf8');
    // Links are fine; scripts, stylesheets, fonts and images from elsewhere are not (no tracking, works offline).
    expect(page).not.toMatch(
      /<script[^>]+src=|<link[^>]+href="https?:|url\(\s*["']?https?:|<img[^>]+src="https?:/i,
    );
  });

  it('publishes the viewer at demo/, with its fonts and the example built in', () => {
    const page = readFileSync(join(out, 'demo/index.html'), 'utf8');
    // Relative paths, so it runs from /loopweft/demo/ on Pages and from any local folder.
    const assets = [...page.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map((m) => m[1] as string);
    expect(assets.some((a) => a.endsWith('.js'))).toBe(true);
    expect(assets.some((a) => a.endsWith('.css'))).toBe(true);
    for (const asset of assets) expect(existsSync(join(out, 'demo', asset)), asset).toBe(true);
    expect(page).not.toMatch(/<script[^>]+src="https?:|<link[^>]+href="https?:/i);
    const files = readdirSync(join(out, 'demo/assets'));
    expect(files.some((f) => /^inter-latin-opsz-normal-.*\.woff2$/.test(f))).toBe(true);
    expect(files.some((f) => /^fraunces-latin-opsz-italic-.*\.woff2$/.test(f))).toBe(true);
    const script = readFileSync(join(out, 'demo', assets.find((a) => a.endsWith('.js')) as string), 'utf8');
    expect(script).toContain('"format": "loopweft"');
  });
});
