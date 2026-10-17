import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { serve } from '../tools/serve.ts';

const dir = mkdtempSync(join(tmpdir(), 'loopweft-serve-'));
mkdirSync(join(dir, 'site', 'demo'), { recursive: true });
writeFileSync(join(dir, 'site', 'demo', 'index.html'), '<!doctype html><title>Demo</title>');
writeFileSync(join(dir, 'site', 'app.js'), 'export {};');
writeFileSync(join(dir, 'secret.txt'), 'outside the served folder');
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('the review server', () => {
  it('serves files of its folder, with their types, and index.html for a folder', async () => {
    const served = await serve(join(dir, 'site'));
    try {
      expect(served.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      const page = await fetch(`${served.url}/demo/?capture=1`);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain('<title>Demo</title>');
      const script = await fetch(`${served.url}/app.js`);
      expect(script.headers.get('content-type')).toContain('text/javascript');
      expect((await fetch(`${served.url}/missing.png`)).status).toBe(404);
    } finally {
      await served.close();
    }
  });

  it('never serves anything outside its folder', async () => {
    const served = await serve(join(dir, 'site'));
    try {
      for (const path of ['/../secret.txt', '/%2e%2e/secret.txt', '/demo/..%2f..%2fsecret.txt']) {
        const res = await fetch(`${served.url}${path}`);
        expect([403, 404], path).toContain(res.status);
        expect(await res.text()).not.toContain('outside the served folder');
      }
    } finally {
      await served.close();
    }
  });
});
