// The agent dry run: a fresh AI agent, given only the Studio's "Copy agent instructions" message and a short
// brief, builds a map with the `loopweft` command line in an empty folder, and everything it does is kept for the
// review. It has the guide (`loopweft guide`) and the command line, and nothing else of Loopweft: it runs outside
// the repository, with no memory or settings of earlier sessions.
//
//   node tools/agent-dry-run.ts --agent claude|codex|agy [--model <model>] [--brief <file>] [--out review/phase7/run1]
//
// - Claude Code runs as `claude -p` with only `loopweft` commands, and reading and writing files in its folder,
//   allowed (no web, no other shell commands, no user settings, plugins or MCP servers).
// - Codex runs as `codex exec` in its workspace-write sandbox; it cannot be held to `loopweft` commands alone, so
//   the transcript shows every command it ran.
// - Antigravity runs as `agy -p` with its terminal sandbox; it runs whatever it chooses without asking (and has
//   web and browser tools), so here too the transcript is the record.
//
// Writes <out>/<agent>/: prompt.md (what the agent was given), transcript.jsonl (the agent's own event stream),
// transcript.md (the same, readable), work/ (its folder afterwards: the map, the HTML, anything else it made),
// validate.txt (`loopweft validate` of the map, run afterwards by this tool) and summary.json. Uses the agent's
// own account; keep the output out of the repository (review/ is git-ignored).
import { spawn } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { starterText } from '../apps/studio/src/shell/agent-text.ts';
import { main } from '../packages/cli/src/main.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const agent = option('agent');
if (agent !== 'claude' && agent !== 'codex' && agent !== 'agy') {
  process.stderr.write(
    'Usage: node tools/agent-dry-run.ts --agent claude|codex|agy [--model <model>] [--brief <file>] [--out <folder>]\n',
  );
  process.exit(2);
}

/** The brief agreed for the Phase 7 checkpoint. */
const BRIEF = `Use the Fixes that fail archetype. Our city keeps adding lanes to its main roads to ease traffic congestion. Congestion eases for a while, but the extra road space draws more people to drive, and after a few years the roads are as congested as before. Make a map of this with about 5 to 8 variables, and a short presentation of 3 to 5 steps: the whole map, each loop, and a closing step. Export it as one HTML file. I have no sources for this yet.`;

const brief = option('brief') ? readFileSync(resolve(option('brief') as string), 'utf8').trim() : BRIEF;
const MAP = 'road-lanes.loopweft';
/** The agent's model; left out, its own default. */
const model = option('model');
const prompt = `${starterText(MAP, false)}${brief}\n`;

const out = resolve(root, option('out') ?? 'review/phase7/run1', agent);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// The agent's folder, outside the repository, and a `loopweft` command on its PATH (for bash and for Windows).
const base = mkdtempSync(join(tmpdir(), 'loopweft-dry-run-'));
const work = join(base, 'work');
const bin = join(base, 'bin');
mkdirSync(work);
mkdirSync(bin);
const cli = join(root, 'packages/cli/bin/loopweft.mjs');
// Node by its full path: an agent's sandboxed terminal may not have Node on its PATH (Antigravity's did not).
const node = process.execPath;
const slashed = (path: string) => path.replace(/\\/g, '/');
writeFileSync(join(bin, 'loopweft'), `#!/bin/sh\nexec "${slashed(node)}" "${slashed(cli)}" "$@"\n`);
chmodSync(join(bin, 'loopweft'), 0o755);
writeFileSync(join(bin, 'loopweft.cmd'), `@"${node}" "${cli}" %*\r\n`);
const env: NodeJS.ProcessEnv = { ...process.env };
// Windows names it Path; a second key of another case would leave which one wins to chance.
const pathKey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
env[pathKey] = `${bin}${delimiter}${env[pathKey] ?? ''}`;
// The repository's own variables would point the agent back here.
delete env.LOOPWEFT_POLYCRISIS_DECK;
delete env.LOOPWEFT_PRIVATE_WORDS;

writeFileSync(join(out, 'prompt.md'), prompt);

/** How each agent is started: its program, its arguments, whether the prompt goes in on stdin, and whether
 * Windows needs a shell to find it (an npm command shim). */
interface Launch {
  file: string;
  args: string[];
  stdin: boolean;
  shell: boolean;
}
const windows = process.platform === 'win32';
const LAUNCH: Record<'claude' | 'codex' | 'agy', () => Launch> = {
  claude: () => ({
    stdin: true,
    shell: windows,
    file: 'claude',
    args: [
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--permission-mode',
      'default',
      '--allowedTools',
      'Bash(loopweft:*)',
      'Read',
      'Write',
      'Edit',
      'Glob',
      'Grep',
      '--disallowedTools',
      'WebFetch',
      'WebSearch',
      '--setting-sources',
      'project',
      '--strict-mcp-config',
      '--no-session-persistence',
      ...(model ? ['--model', model] : []),
    ],
  }),
  codex: () => ({
    stdin: true,
    shell: windows,
    file: 'codex',
    args: [
      'exec',
      '--json',
      '--sandbox',
      'workspace-write',
      '--skip-git-repo-check',
      '--ephemeral',
      '-C',
      work,
      ...(model ? ['--model', model] : []),
      '-',
    ],
  }),
  // agy takes the prompt as an argument; started without a shell, nothing has to quote it.
  agy: () => ({
    stdin: false,
    shell: false,
    file: 'agy',
    args: ['-p', prompt, '--output-format', 'stream-json', '--sandbox', ...(model ? ['--model', model] : [])],
  }),
};
const command = LAUNCH[agent]();

const started = Date.now();
const events: string[] = [];
const code = await new Promise<number>((done) => {
  // Claude Code and Codex read the prompt on stdin, so no shell has to quote it.
  const child = spawn(command.file, command.args, { cwd: work, env, shell: command.shell });
  child.stdin.end(command.stdin ? prompt : '');
  let pending = '';
  child.stdout.on('data', (chunk: Buffer) => {
    pending += chunk.toString('utf8');
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) if (line.trim()) events.push(line.trim());
  });
  child.stderr.on('data', (chunk: Buffer) => process.stderr.write(chunk));
  child.on('close', (status) => {
    if (pending.trim()) events.push(pending.trim());
    done(status ?? 1);
  });
});
const seconds = Math.round((Date.now() - started) / 1000);
writeFileSync(join(out, 'transcript.jsonl'), `${events.join('\n')}\n`);
writeFileSync(join(out, 'transcript.md'), readable(events, agent));

// What it left, and the map checked by this tool.
cpSync(work, join(out, 'work'), { recursive: true });
let validate = '';
const map = readdirSync(work).find((f) => f.endsWith('.loopweft'));
if (map) {
  await main(['validate', join(work, map)], { out: (t) => (validate += t), err: (t) => (validate += t) });
}
writeFileSync(
  join(out, 'validate.txt'),
  validate.split(work).join('work') || 'No .loopweft file was made.\n',
);
writeFileSync(
  join(out, 'summary.json'),
  `${JSON.stringify({ agent, model: model ?? 'its default', exit: code, seconds, files: readdirSync(work), map: map ?? null }, null, 2)}\n`,
);
rmSync(base, { recursive: true, force: true });
process.stdout.write(`${agent}: exit ${code} after ${seconds} s; written to ${out}\n`);

/** The agent's event stream as a readable transcript: what it said, every command and what it printed. */
function readable(lines: string[], who: string): string {
  /** agy streams what it says in pieces, by step. */
  const said = new Map<number, string>();
  const md: string[] = [`# Dry run: ${who}`, '', '## Prompt', '', '```text', prompt.trimEnd(), '```', ''];
  const block = (text: string, max = 60) => {
    const all = text.trimEnd().split('\n');
    const shown = all.length > max ? [...all.slice(0, max), `… (${all.length - max} more lines)`] : all;
    return ['```text', ...shown, '```'];
  };
  for (const line of lines) {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
    } catch {
      md.push(...block(line), '');
      continue;
    }
    if (who === 'claude') md.push(...claudeEvent(event, block));
    else if (who === 'codex') md.push(...codexEvent(event, block));
    else md.push(...agyEvent(event, block, said));
  }
  return `${md.join('\n')}\n`;
}

type Block = (text: string, max?: number) => string[];

function claudeEvent(event: Record<string, unknown>, block: Block): string[] {
  if (event.type === 'system' && event.subtype === 'init') {
    return [
      `*Model: ${String(event.model)}. Tools: ${(event.tools as string[] | undefined)?.join(', ')}.*`,
      '',
    ];
  }
  if (event.type === 'result') {
    return [
      '## Result',
      '',
      `*${String(event.subtype)}, ${event.num_turns} turns, ${Math.round(Number(event.duration_ms) / 1000)} s, cost reported $${event.total_cost_usd}.*`,
      '',
    ];
  }
  const message = event.message as { content?: unknown } | undefined;
  const content = Array.isArray(message?.content) ? (message.content as Record<string, unknown>[]) : [];
  const out: string[] = [];
  for (const part of content) {
    if (part.type === 'text' && event.type === 'assistant') out.push('**Agent:**', '', String(part.text), '');
    if (part.type === 'tool_use') {
      const input = part.input as Record<string, unknown>;
      const shown = typeof input.command === 'string' ? `$ ${input.command}` : JSON.stringify(input, null, 2);
      out.push(`**${String(part.name)}**`, '', ...block(shown, 200), '');
    }
    if (part.type === 'tool_result') {
      const result = Array.isArray(part.content)
        ? (part.content as { text?: string }[]).map((c) => c.text ?? '').join('\n')
        : String(part.content ?? '');
      out.push(`*${part.is_error ? 'Error' : 'Output'}:*`, '', ...block(result), '');
    }
  }
  return out;
}

function codexEvent(event: Record<string, unknown>, block: Block): string[] {
  const item = event.item as Record<string, unknown> | undefined;
  if (event.type === 'item.completed' && item) {
    if (item.type === 'agent_message') return ['**Agent:**', '', String(item.text), ''];
    if (item.type === 'reasoning')
      return [`*Thinking: ${String(item.text).replace(/\s+/g, ' ').slice(0, 400)}*`, ''];
    if (item.type === 'command_execution') {
      return [
        '**Command**',
        '',
        ...block(`$ ${String(item.command)}`, 200),
        '',
        `*Output (exit ${String(item.exit_code)}):*`,
        '',
        ...block(String(item.aggregated_output ?? '')),
        '',
      ];
    }
    if (item.type === 'file_change')
      return ['**File change**', '', ...block(JSON.stringify(item.changes, null, 2)), ''];
    return [`*${String(item.type)}*`, '', ...block(JSON.stringify(item, null, 2)), ''];
  }
  if (event.type === 'turn.completed') return [`*Turn completed: ${JSON.stringify(event.usage)}*`, ''];
  if (event.type === 'thread.started' || event.type === 'turn.started' || event.type === 'item.started')
    return [];
  return [`*${String(event.type)}:* ${JSON.stringify(event).slice(0, 400)}`, ''];
}

function agyEvent(event: Record<string, unknown>, block: Block, said: Map<number, string>): string[] {
  if (event.event === 'init') {
    const init = event.init as { permission_mode?: string; tools?: string[] };
    return [`*Permission mode: ${init.permission_mode}. Tools: ${init.tools?.join(', ')}.*`, ''];
  }
  if (event.event === 'result') {
    const result = event.result as Record<string, unknown>;
    return [
      '## Result',
      '',
      `*${String(result.status)}, ${Math.round(Number(result.duration_seconds))} s.*`,
      '',
    ];
  }
  const step = event.step_update as Record<string, unknown> | undefined;
  if (!step) return [`*${String(event.event)}:* ${JSON.stringify(event).slice(0, 400)}`, ''];
  const index = Number(step.step_index);
  if (step.step_type === 'agent_response') {
    if (typeof step.text_delta === 'string') said.set(index, (said.get(index) ?? '') + step.text_delta);
    if (step.state !== 'DONE') return [];
    const text = said.get(index)?.trim();
    return text ? ['**Agent:**', '', text, ''] : [];
  }
  if (step.step_type === 'tool' && step.state === 'DONE') {
    const info = step.tool_info as { name?: string; parameters?: Record<string, unknown>; output?: string };
    const parameters = info.parameters ?? {};
    const shown =
      typeof parameters.CommandLine === 'string'
        ? `$ ${parameters.CommandLine}`
        : JSON.stringify(parameters, null, 2);
    return [
      `**${String(info.name)}**`,
      '',
      ...block(shown, 200),
      '',
      '*Output:*',
      '',
      ...block(String(info.output ?? '')),
      '',
    ];
  }
  return [];
}
