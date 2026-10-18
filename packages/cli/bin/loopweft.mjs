#!/usr/bin/env node
// The loopweft command. Loopweft's packages ship TypeScript source, which Node 24 runs directly.
const { main } = await import('../src/main.ts');
process.exitCode = await main(process.argv.slice(2));
