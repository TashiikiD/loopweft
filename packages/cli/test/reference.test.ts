// The command line's reference (docs/cli.md) is made from the commands themselves, with examples that run.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { recordedFetch } from '../scripts/recorded-fetch.ts';
import { commandNames } from '../src/main.ts';
import { buildReference, commandLine } from '../src/reference.ts';

const committed = () => readFileSync(new URL('../../../docs/cli.md', import.meta.url), 'utf8');

describe('the command reference', () => {
  it('is current (run `npm run cli-docs` after changing a command)', async () => {
    expect(committed()).toBe(await buildReference({ fetch: recordedFetch }));
  });

  it('describes every command', () => {
    const text = committed();
    for (const name of commandNames()) {
      const shown = name.replace(/^type \w+ /, 'type <kind> ');
      expect(text, name).toContain(`\`${shown}\``);
    }
  });

  it('quotes arguments as every shell reads them', () => {
    expect(commandLine(['add', 'a.loopweft', '--shorthand', 'A -> B (+)\\nB -> A (-)'])).toBe(
      "loopweft add a.loopweft --shorthand 'A -> B (+)\\nB -> A (-)'",
    );
    expect(commandLine(['var', 'add', 'a.loopweft', '--label', "Farmers' income"])).toBe(
      'loopweft var add a.loopweft --label "Farmers\' income"',
    );
    expect(commandLine(['cite', 'add', 'a.loopweft', 'L1', 'S', '--pages', '4–5'])).toBe(
      'loopweft cite add a.loopweft L1 S --pages 4–5',
    );
  });
});
