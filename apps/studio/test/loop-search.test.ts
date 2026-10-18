// The loop search behind the Loops panel: it lists up to a limit and counts every loop (as the worker does).
import { createProject, type Project } from '@loopweft/model';
import { describe, expect, it } from 'vitest';
import { runLoopSearch, searchLoops } from '../src/analysis/loop-search.ts';

function twoLoops(): Project {
  const p = createProject({ title: 'Two loops' });
  p.variables = ['a', 'b', 'c'].map((id) => ({ id, label: id.toUpperCase(), citations: [] }));
  p.links = [
    { id: 'L1', from: 'a', to: 'b', sign: '+', citations: [] },
    { id: 'L2', from: 'b', to: 'a', sign: '+', citations: [] },
    { id: 'L3', from: 'b', to: 'c', sign: '+', citations: [] },
    { id: 'L4', from: 'c', to: 'b', sign: '-', citations: [] },
  ];
  return p;
}

describe('the loop search', () => {
  it('lists up to its limit, and still counts every loop', () => {
    const answer = runLoopSearch({ project: twoLoops(), includeOptional: false, listLimit: 1 });
    expect(answer.loops).toHaveLength(1);
    expect(answer.total).toMatchObject({ count: 2, reinforcing: 1, balancing: 1, capped: false });
  });

  it('runs on the page where there are no workers, and can be stopped', async () => {
    const search = searchLoops({ project: twoLoops(), includeOptional: false, listLimit: 10 });
    expect((await search.result)?.loops).toHaveLength(2);
    const stopped = searchLoops({ project: twoLoops(), includeOptional: false, listLimit: 10 });
    stopped.stop();
    expect(await stopped.result).toBeNull();
  });
});
