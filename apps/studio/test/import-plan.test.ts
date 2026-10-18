// The import wizard's model: guesses, changes of where a column goes, and what the importer is given.
import { readImportFile } from '@loopweft/model';
import { describe, expect, it } from 'vitest';
import {
  choiceProblems,
  initialChoices,
  plansOf,
  samples,
  type TableChoice,
  withShape,
  withTarget,
} from '../src/import/plan.ts';

const bytes = (text: string) => new TextEncoder().encode(text);

async function tables(text: string, name = 'map.csv') {
  const source = await readImportFile({ name, bytes: bytes(text) });
  if (source.format !== 'tables') throw new Error('not tables');
  return source;
}

describe('the import plan', () => {
  it('keeps every column, guessing where it goes, and gives each new custom field its own id', async () => {
    const source = await tables('Cause,Effect,Notes,notes!\nA,B,x,y\nB,C,z,w\n');
    let choices = initialChoices(source);
    expect(choices[0]?.shape).toBe('links');
    expect(
      Object.values(choices[0]?.mapping ?? {}).map((t) => (t.kind === 'custom' ? t.id : t.kind)),
    ).toEqual(['field', 'field', 'notes', 'notes_2']);
    choices = withTarget(choices, 0, 'Cause', { kind: 'custom', type: 'text' });
    expect(choices[0]?.mapping.Cause).toEqual({ kind: 'custom', id: 'cause', name: 'Cause', type: 'text' });
    expect(choiceProblems(choices)).toEqual([
      "map.csv: Choose the column that holds each link's cause (from).",
    ]);
    expect(samples((choices[0] as TableChoice).table, 'Cause')).toEqual(['A', 'B']);
  });

  it('gives the importer only the tables kept', async () => {
    const source = await tables('Cause,Effect\nA,B\n');
    const left = withShape(initialChoices(source), 0, 'ignore');
    expect(plansOf(left)).toEqual([]);
    expect(choiceProblems(left)).toEqual(['Choose at least one table to import.']);
  });
});
