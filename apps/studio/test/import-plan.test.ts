// The import wizard's model: guesses, changes of where a column goes, and what the importer is given.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImportFile } from '@loopweft/model';
import { describe, expect, it } from 'vitest';
import {
  choiceProblems,
  describeSource,
  hasOwnTitle,
  initialChoices,
  kumuConnectionFields,
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

describe('a Kumu map', () => {
  // A path, not a URL: under jsdom the global URL is jsdom's, which Node's file functions refuse.
  const fixture = (name: string) =>
    readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../../packages/model/test/fixtures/import', name),
    );

  it("offers the fields a connection holds values in for its signs, by the names Kumu's export gives them", async () => {
    const source = await readImportFile({ name: 'rush.json', bytes: fixture('kumu-export.json') });
    if (source.format !== 'kumu') throw new Error('not Kumu');
    expect(kumuConnectionFields(source.data)).toEqual([
      { value: 'connection type', label: 'Connection Type' },
      { value: 'strength', label: 'Strength' },
      { value: 'label', label: 'Label' },
      { value: 'description', label: 'Description' },
      { value: 'confidence', label: 'Confidence' },
    ]);
    expect(describeSource(source)).toBe(
      `A Kumu map, "Morning rush" (Kumu's JSON export): 5 elements and 6 connections on its maps.`,
    );
    // Kumu's export names its project; a blueprint does not.
    expect(hasOwnTitle(source)).toBe(true);
    const blueprint = await readImportFile({ name: 'b.json', bytes: fixture('kumu-blueprint.json') });
    expect(hasOwnTitle(blueprint)).toBe(false);
  });
});
