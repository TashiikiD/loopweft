import { readFileSync } from 'node:fs';
import { createProject, type Project, readProject } from '@loopweft/model';

/** The polycrisis example, parsed. */
export function example(): Project {
  const result = readProject(
    readFileSync(new URL('../../../examples/polycrisis.loopweft', import.meta.url), 'utf8'),
  );
  if (!result.ok) throw new Error(JSON.stringify(result.issues, null, 2));
  return result.project;
}

/** A made-up project for tests: categories, a few links and no positions. */
export function smallProject(): Project {
  const p = createProject({ title: 'Test' });
  p.types.categories = [
    { id: 'a', name: 'Alpha' },
    { id: 'b', name: 'Beta' },
    { id: 'c', name: 'Gamma' },
  ];
  const ids = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1', 'c2', 'c3', 'free'];
  p.variables = ids.map((id) => ({
    id,
    label: id.toUpperCase(),
    ...(id === 'free' ? {} : { category: id[0] as string }),
    citations: [],
  }));
  const pairs = [
    ['a1', 'a2'],
    ['a2', 'a3'],
    ['a3', 'b1'],
    ['b1', 'b2'],
    ['b2', 'b3'],
    ['b3', 'c1'],
    ['c1', 'c2'],
    ['c2', 'c3'],
    ['c3', 'a1'],
    ['free', 'a1'],
    ['b2', 'a2'],
  ];
  p.links = pairs.map(([from, to], i) => ({
    id: `L${i + 1}`,
    from: from as string,
    to: to as string,
    sign: '+' as const,
    citations: [],
  }));
  return p;
}
