// @loopweft/export: every export but the one-file HTML (that one is @loopweft/player's). Drawn exports run in
// the export page (page/), in the Studio's hidden frame or a headless browser (node/); this entry holds what
// both sides share.
export {
  BRIDGE,
  type BridgeCall,
  type BridgeReply,
  type BridgeRequest,
  encodeBase64,
} from './bridge.ts';
export {
  type EventOf,
  ExportEngine,
  type FileEvent,
  fileEvent,
  gifSizeWarning,
  isVideoJob,
  type Job,
  type JobEvent,
  type Opened,
  type VideoDataEvent,
  type VideoEndEvent,
  type VideoEvent,
} from './engine.ts';
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
export { SLIDE_PAGE, SLIDE_QUALITY, type SlidePicture, type SlidesResult, slidesPdf } from './pdf/slides.ts';
export { type Block, PAPER, type Paper } from './pdf/typeset.ts';
export {
  checkPictureJob,
  type FrameFormat,
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
export { NOTES as SVG_NOTES } from './svg/flatten.ts';
export { videoSupport } from './video/encode.ts';
export { changedRect, GIF_FPS, GIF_HEAD, GIF_SIZE, GIF_WARNING_BYTES, GifWriter } from './video/gif.ts';
export { Mp4Writer } from './video/mp4.ts';
export {
  checkVideoJob,
  FRAME_RATES,
  GIF_HEIGHT,
  GIF_RATE,
  HOLD_DEFAULT,
  HOLD_MAX,
  holdFrames,
  isVideoFormat,
  MOTION_MAX,
  VIDEO_FORMATS,
  VIDEO_HEIGHTS,
  type VideoFormat,
  type VideoJob,
  type VideoPlan,
  type VideoStep,
  type VideoTarget,
  type VideoTiming,
  videoPlan,
  videoSize,
} from './video/plan.ts';
export { HARDWARE_NOTE } from './video/sink.ts';
export { WebmWriter } from './video/webm.ts';
export type { EncodedFrame, VideoMeta, VideoTrack, VideoWriter } from './video/writer.ts';
export { I420_COLOUR, toI420 } from './video/yuv.ts';
