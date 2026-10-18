// The shorthand box's preview: what it would add, or the problems that stop it, line by line.
import { createProject } from '@loopweft/model';
import { describe, expect, it } from 'vitest';
import { previewShorthand } from '../src/map/shorthand.tsx';

describe('the shorthand preview', () => {
  it('shows no missing-sign warning on a line the model refuses, but keeps it on the others', () => {
    for (const first of ['A -> B (conf=bogus)', 'A -> B (type=missing)']) {
      const preview = previewShorthand(createProject({ title: 'Test' }), `${first}\nC -> D`);
      expect(preview?.out).toBeUndefined();
      const issues = preview?.issues ?? [];
      expect(issues.map((i) => `${i.severity} ${i.line}`)).toEqual(['error 1', 'warning 2']);
      expect(issues[1]?.message).toBe('No sign given for C -> D; recorded as unknown (?).');
    }
  });
});
