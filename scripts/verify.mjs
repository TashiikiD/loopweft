#!/usr/bin/env node
// Source: DataViz scripts/verify.mjs @ efcdbe2 (TashiikiD/DataViz, private), copied for Loopweft.
//
// Local merge gate. Runs every check a slice PR must pass and prints a
// Markdown summary to paste into the PR body.
//
//   npm run verify          full gate (used before merging a PR, and by CI)
//   npm run verify:fast     typecheck + lint + unit (used by the pre-push hook)

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const fast = process.argv.includes('--fast');
const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts ?? {};

/** Steps run in order; `full` steps are skipped by --fast, missing scripts are skipped. */
const steps = [
  { name: 'typecheck', script: 'typecheck' },
  { name: 'lint', script: 'lint' },
  { name: 'unit', script: 'test' },
  { name: 'render', script: 'test:render', full: true },
  { name: 'e2e', script: 'test:e2e', full: true },
];

const results = [];
for (const step of steps) {
  if (fast && step.full) continue;
  if (!scripts[step.script]) {
    results.push({ ...step, status: 'n/a', ms: 0 });
    continue;
  }
  process.stdout.write(`\n▶ ${step.name} (npm run ${step.script})\n`);
  const started = performance.now();
  const run = spawnSync('npm', ['run', '--silent', step.script], { stdio: 'inherit', shell: true });
  const ms = Math.round(performance.now() - started);
  results.push({ ...step, status: run.status === 0 ? 'pass' : 'FAIL', ms });
  if (run.status !== 0) break;
}

const failed = results.some((r) => r.status === 'FAIL');
const lines = [
  `### verify (${fast ? 'fast' : 'full'}): ${failed ? 'FAILED' : 'passed'}`,
  '',
  '| step | result | time |',
  '|---|---|---|',
  ...results.map(
    (r) => `| ${r.name} | ${r.status} | ${r.status === 'n/a' ? '' : `${(r.ms / 1000).toFixed(1)}s`} |`,
  ),
  '',
  `Node ${process.version} on ${process.platform}`,
];
process.stdout.write(`\n${lines.join('\n')}\n`);
process.exit(failed ? 1 : 0);
