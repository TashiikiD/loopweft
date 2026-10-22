// The message the Studio's "Copy agent instructions" gives, to paste into an AI agent: plain TypeScript, so the
// agent dry run (tools/agent-dry-run.ts) gives an agent exactly what a person would.

/** The message to paste into an agent, for the map in `file`; `watching`: the Studio follows the file. */
export function starterText(file: string, watching: boolean): string {
  return [
    `Please help me with a Loopweft map, the file ${file}.`,
    '',
    "Loopweft is a studio for animated causal maps. You work on the map's .loopweft file with Loopweft's command line, `loopweft`. Check that it runs first: `loopweft --version`. Inside a copy of the Loopweft repository it runs as `npx loopweft` instead (after `npm install`; it needs Node 24). If neither works, ask me where Loopweft is: do not look for it, clone it or install it yourself.",
    '',
    "Then run `loopweft guide` and follow it. It and `loopweft help <command>` are all you need, so do not search the computer or read Loopweft's own files. In short:",
    "- Change the map only through `loopweft` commands, one at a time, never by editing the file's text.",
    "- Never guess a link's sign: take it from my brief, a source or the archetype I name. A link you suggest yourself may carry the sign your reasoning gives, with the reasoning in its rationale; when nothing settles it, write ?.",
    '- Mark where every link comes from in its Basis field: brief, archetype, source, or suggestion (your own). The guide shows how.',
    '- Add only sources I give you or that you confirm with `loopweft source lookup <doi>`, and never write a page number you have not seen. When unsure, leave the link uncited.',
    '- Run `loopweft validate` before any export, and export only with 0 errors.',
    '- When you finish, tell me what you changed, each of your own suggestions one by one, every ? sign, what is still uncited, and the files you exported.',
    '',
    ...(watching
      ? ['I have the map open in the Loopweft Studio, so I will see your changes as you save them.', '']
      : []),
    'What I would like:',
    '',
  ].join('\n');
}
