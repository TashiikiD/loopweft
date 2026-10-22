// `loopweft guide`: the guide for AI agents (docs/agents/SKILL.md), printed, or put into a folder where an agent
// will find it: as a Claude Code skill (.claude/skills/loopweft/SKILL.md) and as AGENTS.md, which Codex and
// other agents read. A file already there is never replaced.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OpError } from '@loopweft/model';
import type { CommandResult } from './commands.ts';

const GUIDE = new URL('../../../docs/agents/SKILL.md', import.meta.url);

/** The guide as the repository holds it: a Claude Code skill, with its name and description up top. */
export const guideText = (): string => readFileSync(GUIDE, 'utf8');

/** The guide without the skill's header, for AGENTS.md. */
export function guideBody(text = guideText()): string {
  const header = /^---\n[\s\S]*?\n---\n+/.exec(text);
  return header ? text.slice(header[0].length) : text;
}

/** Where `--install` puts the guide, inside the folder, and what goes there. */
export const INSTALLED = [
  { path: ['.claude', 'skills', 'loopweft', 'SKILL.md'], for: 'Claude Code', text: guideText },
  { path: ['AGENTS.md'], for: 'Codex and other agents', text: () => guideBody() },
] as const;

type Status = 'written' | 'current' | 'kept';

export function guideCommand(o: { install?: string }): CommandResult {
  if (o.install === undefined) {
    const text = guideText();
    return { text: text.trimEnd(), data: { guide: text } };
  }
  const folder = o.install;
  if (!existsSync(folder) || !statSync(folder).isDirectory()) {
    throw new OpError(`No folder ${folder}.`, 'usage');
  }
  // Paths are given inside the folder, with forward slashes, the same on every system.
  const files: { path: string; for: string; status: Status }[] = [];
  for (const target of INSTALLED) {
    const path = join(folder, ...target.path);
    const text = target.text();
    let status: Status;
    if (!existsSync(path)) {
      mkdirSync(join(folder, ...target.path.slice(0, -1)), { recursive: true });
      writeFileSync(path, text, { flag: 'wx' });
      status = 'written';
    } else status = readFileSync(path, 'utf8') === text ? 'current' : 'kept';
    files.push({ path: target.path.join('/'), for: target.for, status });
  }
  const line = (f: (typeof files)[number]) =>
    f.status === 'written'
      ? `Wrote ${f.path} (for ${f.for}).`
      : f.status === 'current'
        ? `${f.path} already holds this guide (for ${f.for}).`
        : `Left ${f.path} as it was: it already exists and holds something else. Remove it, or add the guide to it by hand (loopweft guide prints it).`;
  return { text: [`In ${folder}:`, ...files.map(line)].join('\n'), data: { folder, files } };
}
