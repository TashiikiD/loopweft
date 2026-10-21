// How the Studio talks to the export page in its hidden frame: numbered requests, each answered once, with a
// file's bytes moved rather than copied. Messages carry this name, so the page ignores any others.
export const BRIDGE = 'loopweft-export';

export type BridgeCall = 'open' | 'start' | 'next' | 'cancel';

export interface BridgeRequest {
  bridge: typeof BRIDGE;
  id: number;
  call: BridgeCall;
  args: unknown[];
}

export type BridgeReply =
  | { bridge: typeof BRIDGE; ready: true }
  | { bridge: typeof BRIDGE; id: number; result: unknown }
  | { bridge: typeof BRIDGE; id: number; error: string };

/** The fields of an event that hold bytes: a file's or a video piece's, and a video's final head. */
export const BYTE_FIELDS = ['bytes', 'head'] as const;

/** The byte arrays an event holds, for the Studio to move rather than copy. */
export function eventBuffers(event: object | null): ArrayBuffer[] {
  if (!event) return [];
  const fields = event as Record<string, unknown>;
  const buffers = BYTE_FIELDS.flatMap((f) =>
    fields[f] instanceof Uint8Array ? [(fields[f] as Uint8Array).buffer as ArrayBuffer] : [],
  );
  return [...new Set(buffers)];
}

/** An event as JSON can carry it: its bytes as base64, under `base64`. */
export function eventToWire(event: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const base64: Record<string, string> = {};
  for (const [key, value] of Object.entries(event)) {
    if (value instanceof Uint8Array) base64[key] = encodeBase64(value);
    else out[key] = value;
  }
  return { ...out, base64 };
}

/** Bytes as base64, for the DevTools protocol, which carries text. */
export function encodeBase64(bytes: Uint8Array): string {
  let text = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    text += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(text);
}
