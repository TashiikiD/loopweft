// @loopweft/export: every export but the one-file HTML (that one is @loopweft/player's). Drawn exports run in
// the export page (page/), in the Studio's hidden frame or a headless browser (node/); this entry holds what
// both sides share.
export { BRIDGE, type BridgeCall, type BridgeReply, type BridgeRequest, encodeBase64 } from './bridge.ts';
export { ExportEngine, type Job, type JobEvent, type Opened } from './engine.ts';
export {
  type Box,
  documentStyles,
  drawFrame,
  encodeCanvas,
  type FrameOptions,
  frameDocument,
  STAGE_SIZE,
} from './frame.ts';
export { type DocumentPdfOptions, type PdfResult, projectDate } from './pdf/document.ts';
export { ALL_FONT_FILES, type Face, FONT_FILES, type FontReader, planFonts } from './pdf/fonts.ts';
export { notesBlocks, notesPdf } from './pdf/notes.ts';
export { referencesBlocks, referencesPdf } from './pdf/references.ts';
export { type Block, PAPER, type Paper } from './pdf/typeset.ts';
export {
  checkPictureJob,
  fileStem,
  type Picture,
  type PictureFormat,
  type PictureJob,
  type PictureTarget,
  pictureSize,
  picturesFor,
  SCALES,
  stepFileName,
  TRIM_MARGIN,
} from './pictures.ts';
export { ExportStage, loadFonts } from './stage.ts';
