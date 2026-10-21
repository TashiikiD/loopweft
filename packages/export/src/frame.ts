// A frame of the stage, drawn by the browser itself: the stage's own HTML and SVG, with the page's styles and
// fonts, put inside an SVG <foreignObject> and drawn onto a canvas. So a picture is what the audience window
// shows, drawn by the same engine (checked against a screenshot within a few levels of 255 per colour), and the
// Studio and the command line, which both draw in the export page, make the same pictures.

/** A box on the stage, in stage pixels. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FrameOptions {
  /** Stage pixels per output pixel: 1 for 1920 × 1080, 2 for 3840 × 2160. */
  scale: number;
  /** The part of the stage to draw (default: all of it). */
  crop?: Box;
}

/** The stage's size in stage pixels (@loopweft/layout's STAGE). */
export const STAGE_SIZE = { w: 1920, h: 1080 } as const;

/**
 * Every style rule of a document, as text: the page's stylesheets, its fonts among them (as data addresses in
 * the export page, so the frame needs nothing from anywhere else). Read once per page.
 */
export function documentStyles(doc: Document): string {
  let css = '';
  for (const sheet of doc.styleSheets) {
    for (const rule of sheet.cssRules) css += `${rule.cssText}\n`;
  }
  return css;
}

const escapeXmlText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * A copy of the stage whose boxes keep the sizes the page gave them. Inside an SVG image Chrome lays text out
 * a little differently (a card a pixel and a half shorter, say), which would add up down a column of cards;
 * every box of the copy is given its width and height from the page, so each lands where the audience window
 * puts it, and only the text inside a box can sit a pixel apart. The stage itself is not touched.
 */
export function pinnedCopy(viewport: Element): Element {
  const copy = viewport.cloneNode(true) as Element;
  const view = viewport.ownerDocument.defaultView;
  if (!view) return copy;
  const pin = (live: Element, made: Element) => {
    if (live.namespaceURI === SVG_NS) return;
    const style = view.getComputedStyle(live);
    if (style.display !== 'inline' && style.display !== 'contents' && style.display !== 'none') {
      const box = made as HTMLElement;
      box.style.setProperty('width', style.width);
      box.style.setProperty('height', style.height);
    }
    const a = live.children;
    const b = made.children;
    for (let i = 0; i < a.length; i++) pin(a[i] as Element, b[i] as Element);
  };
  pin(viewport, copy);
  return copy;
}

/**
 * The SVG document that draws `viewport` (a stage's `.lw-viewport`, 1920 × 1080): the element serialized as
 * XHTML inside a foreignObject, with `styles`, cropped and scaled as asked.
 */
export function frameDocument(viewport: Element, styles: string, options: FrameOptions): string {
  const crop = options.crop ?? { x: 0, y: 0, w: STAGE_SIZE.w, h: STAGE_SIZE.h };
  const width = Math.round(crop.w * options.scale);
  const height = Math.round(crop.h * options.scale);
  const html = new XMLSerializer().serializeToString(pinnedCopy(viewport));
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${crop.x} ${crop.y} ${crop.w} ${crop.h}">`,
    `<foreignObject x="0" y="0" width="${STAGE_SIZE.w}" height="${STAGE_SIZE.h}">`,
    `<div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:${STAGE_SIZE.w}px;height:${STAGE_SIZE.h}px;overflow:hidden">`,
    `<style>${escapeXmlText(styles)}</style>`,
    html,
    '</div></foreignObject></svg>',
  ].join('');
}

/**
 * Draws the frame onto a new canvas. The SVG goes in as a data address: a blob address makes the canvas
 * "tainted" (unreadable) in a page opened from disk.
 */
export async function drawFrame(
  viewport: Element,
  styles: string,
  options: FrameOptions,
): Promise<HTMLCanvasElement> {
  const svg = frameDocument(viewport, styles, options);
  const doc = viewport.ownerDocument;
  const img = doc.createElement('img');
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = doc.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  // The browser's usual (accelerated) canvas: a canvas kept in memory for reading ("willReadFrequently") draws
  // text in an SVG image about a pixel off from where the page itself draws it, as does Chrome started with
  // --disable-gpu.
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser gives no canvas to draw on.');
  context.drawImage(img, 0, 0);
  return canvas;
}

/** A canvas's pixels as an image file: PNG, or JPEG at `quality` (0 to 1). */
export function encodeCanvas(
  canvas: HTMLCanvasElement,
  type: 'image/png' | 'image/jpeg',
  quality?: number,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error(`This browser could not make a ${type === 'image/png' ? 'PNG' : 'JPEG'}.`));
          return;
        }
        blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
      },
      type,
      quality,
    );
  });
}
