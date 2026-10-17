import { describe, expect, it } from 'vitest';
import { FORMAT_VERSION, MIGRATIONS, type Migration, migrate, parseProject } from '../src/index.ts';

const v1 = () => ({ format: 'loopweft', version: 1, meta: { title: 'Old' }, links: [] as unknown[] });

/** Pretend migrations, to exercise the machinery before version 2 exists. */
const chain: Migration[] = [
  {
    from: 1,
    to: 2,
    describe: 'Links gain `strength`',
    up: (d) => ({ ...d, links: (d.links as object[]).map((l) => ({ ...l, strength: 1 })) }),
  },
  {
    from: 2,
    to: 3,
    describe: 'meta.title becomes meta.name',
    up: ({ meta, ...d }) => ({ ...d, meta: { name: (meta as { title: string }).title } }),
  },
];

describe('migrations', () => {
  it('has none yet: version 1 is the first format', () => {
    expect(FORMAT_VERSION).toBe(1);
    expect(MIGRATIONS).toEqual([]);
    const result = parseProject(v1());
    expect(result.ok && result.migrated).toEqual([]);
  });

  it('upgrades one version at a time and reports each step', () => {
    const input = { ...v1(), links: [{ id: 'L1' }] };
    const result = migrate(input, chain, 3);
    expect(result).toEqual({
      ok: true,
      from: 1,
      document: { format: 'loopweft', version: 3, meta: { name: 'Old' }, links: [{ id: 'L1', strength: 1 }] },
      applied: ['1 → 2: Links gain `strength`', '2 → 3: meta.title becomes meta.name'],
    });
    expect(input).toEqual({ ...v1(), links: [{ id: 'L1' }] });
  });

  it('starts from the version the file has', () => {
    const result = migrate({ ...v1(), version: 2 }, chain, 3);
    expect(result.ok && result.applied).toEqual(['2 → 3: meta.title becomes meta.name']);
  });

  it('fails clearly when a step is missing', () => {
    const result = migrate(v1(), [chain[1] as Migration], 3);
    expect(result).toEqual({
      ok: false,
      issues: [
        {
          severity: 'error',
          code: 'unsupportedVersion',
          message: 'No migration from format version 1 to 2.',
          path: ['version'],
        },
      ],
    });
  });
});
