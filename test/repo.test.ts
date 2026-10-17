// Source: DataViz test/repo.test.ts @ efcdbe2 (TashiikiD/DataViz, private), adapted for Loopweft.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);

/**
 * AGENTS.md: permissive dependencies only, development tools included. Expressions must be all-permissive.
 * No MPL-2.0 (which is why Vite stays on 7: Vite 8 requires Lightning CSS) and no copyleft licences.
 */
const ALLOWED = [
  'MIT',
  'MIT-0',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  '0BSD',
  'BlueOak-1.0.0',
  'Zlib',
  'CC0-1.0',
];
/** Fonts may also use the SIL Open Font License. */
const FONT_LICENSES = ['OFL-1.1'];

/** Every license an SPDX expression names, e.g. `(MIT AND Zlib)` → MIT, Zlib; `MIT OR Apache-2.0` → both. */
const licensesIn = (expression: string): string[] =>
  expression
    .replace(/[()]/g, ' ')
    .split(/\s+(?:AND|OR)\s+|\s+/)
    .filter(Boolean);

interface LockEntry {
  license?: string;
  link?: boolean;
  version?: string;
}

const lock = (): Record<string, LockEntry> =>
  (
    JSON.parse(readFileSync(new URL('package-lock.json', root), 'utf8')) as {
      packages: Record<string, LockEntry>;
    }
  ).packages;

describe('repository rules', () => {
  it('installs only dependencies under the allowed licenses', () => {
    const offending = Object.entries(lock())
      .filter(([path, info]) => path.includes('node_modules/') && !info.link)
      .flatMap(([path, info]) => {
        const allowed = path.includes('@fontsource') ? [...ALLOWED, ...FONT_LICENSES] : ALLOWED;
        const licenses = licensesIn(info.license ?? 'UNKNOWN');
        return licenses.every((l) => allowed.includes(l)) ? [] : [`${path}: ${info.license ?? 'no license'}`];
      });
    expect(offending).toEqual([]);
  });

  it('reads SPDX expressions licence by licence', () => {
    expect(licensesIn('MIT')).toEqual(['MIT']);
    expect(licensesIn('(MIT AND Zlib)')).toEqual(['MIT', 'Zlib']);
    expect(licensesIn('MIT OR Apache-2.0')).toEqual(['MIT', 'Apache-2.0']);
    expect(licensesIn('(MPL-2.0 OR MIT)').every((l) => ALLOWED.includes(l))).toBe(false);
  });

  it('pins every direct dependency to an exact version', () => {
    const manifests = ['package.json', 'packages/model/package.json'].map(
      (file) =>
        JSON.parse(readFileSync(new URL(file, root), 'utf8')) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        },
    );
    const ranges = manifests.flatMap((m) =>
      Object.entries({ ...m.dependencies, ...m.devDependencies })
        .filter(([name, version]) => !name.startsWith('@loopweft/') && !/^\d+\.\d+\.\d+$/.test(version))
        .map(([name, version]) => `${name}@${version}`),
    );
    expect(ranges).toEqual([]);
  });

  it('keeps Vite on 7, so Lightning CSS (MPL-2.0) never enters the lockfile', () => {
    const packages = lock();
    expect(packages['node_modules/vite']?.version).toMatch(/^7\./);
    expect(Object.keys(packages).filter((p) => p.includes('lightningcss'))).toEqual([]);
  });

  it('commits the pre-push hook as executable, so git runs it on every platform', () => {
    const entry = spawnSync('git', ['ls-files', '-s', '.githooks/pre-push'], {
      cwd: root,
      encoding: 'utf8',
    }).stdout;
    expect(entry.split(' ')[0]).toBe('100755');
  });
});
