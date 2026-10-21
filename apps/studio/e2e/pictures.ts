// Shared by the export tests: the example, pictures drawn by the export page in this computer's browser, a
// PNG's size, how much two pictures differ, and screens saved for the review.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { JobEvent, PictureJob } from '@loopweft/export';
import { exportInBrowser } from '@loopweft/export/node';
import { expect, type Page } from '@playwright/test';

export const REVIEW = process.env.LOOPWEFT_REVIEW ? resolve(process.env.LOOPWEFT_REVIEW) : null;
export const EXAMPLE = resolve('examples/polycrisis.loopweft');
export const text = readFileSync(EXAMPLE, 'utf8');

/** A PNG's width and height, from its header. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } {
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** The files one job of the export page makes, from the example (or another project's text). */
export async function pictures(job: PictureJob, project = text): Promise<JobEvent[]> {
  const made: JobEvent[] = [];
  await exportInBrowser(project, job, (event) => {
    made.push(event);
  });
  return made;
}

/**
 * How two pictures of the same size differ, in blocks of 8 × 8 pixels (each block's mean colour), so that a
 * line of text a pixel lower counts for little and a missing caption, card or figure for a lot: the share of
 * blocks more than 12 levels apart (of 255), and the mean difference of the pixels themselves.
 */
export async function difference(
  page: Page,
  a: Uint8Array,
  b: Uint8Array,
): Promise<{ far: number; mean: number }> {
  return page.evaluate(
    async ([x, y]) => {
      const pixels = async (base64: string) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
        context.drawImage(bitmap, 0, 0);
        return context.getImageData(0, 0, bitmap.width, bitmap.height);
      };
      const [p, q] = [await pixels(x), await pixels(y)];
      const { width, height } = p;
      let sum = 0;
      for (let i = 0; i < p.data.length; i += 4) {
        for (let k = 0; k < 3; k++) sum += Math.abs((p.data[i + k] ?? 0) - (q.data[i + k] ?? 0)) / 3;
      }
      let far = 0;
      let blocks = 0;
      for (let by = 0; by + 8 <= height; by += 8) {
        for (let bx = 0; bx + 8 <= width; bx += 8) {
          blocks++;
          const mean = [0, 0, 0, 0, 0, 0];
          for (let yy = by; yy < by + 8; yy++) {
            for (let xx = bx; xx < bx + 8; xx++) {
              const i = (yy * width + xx) * 4;
              for (let k = 0; k < 3; k++) {
                mean[k] = (mean[k] ?? 0) + (p.data[i + k] ?? 0) / 64;
                mean[k + 3] = (mean[k + 3] ?? 0) + (q.data[i + k] ?? 0) / 64;
              }
            }
          }
          const d = Math.max(...[0, 1, 2].map((k) => Math.abs((mean[k] ?? 0) - (mean[k + 3] ?? 0))));
          if (d > 12) far++;
        }
      }
      return { far: far / blocks, mean: sum / (width * height) };
    },
    [Buffer.from(a).toString('base64'), Buffer.from(b).toString('base64')] as const,
  );
}

export function review(name: string, bytes: Uint8Array) {
  if (!REVIEW) return;
  mkdirSync(REVIEW, { recursive: true });
  writeFileSync(join(REVIEW, name), bytes);
}
