// The export tests' evidence on a byte mismatch (apps/studio/e2e/evidence.ts): two pictures that should be the
// same bytes and are not are both kept for the review; the same bytes keep nothing.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { sameBytes } from '../apps/studio/e2e/evidence.ts';

const dir = mkdtempSync(join(tmpdir(), 'loopweft-evidence-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('evidence of a byte mismatch', () => {
  it('keeps both files when they differ, and nothing when they are the same', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      expect(sameBytes('same.png', new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]), dir)).toBe(true);
      expect(existsSync(join(dir, 'mismatch'))).toBe(false);

      expect(sameBytes('png-cli-S05.6b.png', new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]), dir)).toBe(
        false,
      );
      expect(readdirSync(join(dir, 'mismatch')).sort()).toEqual([
        'png-cli-S05.6b-a.png',
        'png-cli-S05.6b-b.png',
      ]);
      expect([...readFileSync(join(dir, 'mismatch', 'png-cli-S05.6b-a.png'))]).toEqual([1, 2, 3]);
      expect([...readFileSync(join(dir, 'mismatch', 'png-cli-S05.6b-b.png'))]).toEqual([1, 2, 4]);
      expect(log).toHaveBeenCalledWith(expect.stringMatching(/^Not the same bytes \(3 and 3\); both kept: /));

      // With no folder to keep them in, it only answers.
      expect(sameBytes('x.png', new Uint8Array([1]), new Uint8Array([2]), null)).toBe(false);
    } finally {
      log.mockRestore();
    }
  });
});
