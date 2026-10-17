import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
});
