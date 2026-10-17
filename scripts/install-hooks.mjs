#!/usr/bin/env node
// Source: DataViz scripts/install-hooks.mjs @ efcdbe2 (TashiikiD/DataViz, private), copied for Loopweft.
//
// Points git at the versioned .githooks folder. Runs on `npm install` (prepare);
// silently does nothing outside a git checkout (e.g. when installed as a tarball).

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (existsSync(new URL('../.git', import.meta.url))) {
  spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });
}
