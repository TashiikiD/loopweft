// The agent dry run's check of what an agent made: the map it was told to make (`--map`), by that name, validated
// with `loopweft validate`. Another .loopweft file is not that map: it is named, not validated in its place.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { main } from '../packages/cli/src/main.ts';

export interface MapCheck {
  /** The named map was made. */
  found: boolean;
  /** It validates (no errors; warnings allowed). */
  valid: boolean;
  /** What `validate` said, or why there is nothing to validate. */
  text: string;
  /** Other .loopweft files in the folder. */
  others: string[];
}

/** Checks the map named `map` in the folder `work`. */
export async function checkNamedMap(work: string, map: string): Promise<MapCheck> {
  const others = readdirSync(work).filter((f) => f.endsWith('.loopweft') && f !== map);
  const also = others.length ? ` Other maps in the folder, not checked: ${others.join(', ')}.` : '';
  const path = join(work, map);
  if (!existsSync(path)) {
    return { found: false, valid: false, text: `The named map, ${map}, was not made.${also}\n`, others };
  }
  let said = '';
  const code = await main(['validate', path], { out: (t) => (said += t), err: (t) => (said += t) });
  return {
    found: true,
    valid: code === 0,
    text: `${said.split(work).join('work')}${also ? `${also.trim()}\n` : ''}`,
    others,
  };
}
