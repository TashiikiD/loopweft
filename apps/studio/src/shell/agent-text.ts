// The message the Studio's "Copy agent instructions" gives, to paste into an AI agent: plain TypeScript, so the
// agent dry run (tools/agent-dry-run.ts) gives an agent exactly what a person would.

/** The message to paste into an agent, for the map in `file`; `watching`: the Studio follows the file. */
export function starterText(file: string, watching: boolean): string {
  return [
    `Please help me with a Loopweft map, the file ${file}.`,
    '',
    "Loopweft is a studio for animated causal maps. You work on the map's .loopweft file with Loopweft's command line, `loopweft`. Inside a copy of the Loopweft repository (https://github.com/TashiikiD/loopweft, after `npm install`; it needs Node 24) it runs as `npx loopweft`.",
    '',
    'First run `loopweft guide` and follow it. In short:',
    "- Change the map only through `loopweft` commands, never by editing the file's text.",
    "- Never guess a link's sign: write ? when neither my brief nor a source says which way it goes.",
    '- Add only sources I give you or that you confirm with `loopweft source lookup <doi>`, and never write a page number you have not seen. When unsure, leave the link uncited.',
    '- Run `loopweft validate` before any export, and export only with 0 errors.',
    '- When you finish, tell me what you changed, which links are your own suggestions, every ? sign, what is still uncited, and the files you exported.',
    '',
    ...(watching
      ? ['I have the map open in the Loopweft Studio, so I will see your changes as you save them.', '']
      : []),
    'What I would like:',
    '',
  ].join('\n');
}
