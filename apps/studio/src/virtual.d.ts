// The player's one-file page, given by @loopweft/player's Vite plugin (packages/player/build/plugin.ts).
declare module 'virtual:loopweft-player-template' {
  const html: string;
  export default html;
}

// The export page, given by @loopweft/export's Vite plugin (packages/export/build/plugin.ts).
declare module 'virtual:loopweft-export-page' {
  const html: string;
  export default html;
}
