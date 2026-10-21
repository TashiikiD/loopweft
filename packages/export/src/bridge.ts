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

/** Bytes as base64, for the DevTools protocol, which carries text. */
export function encodeBase64(bytes: Uint8Array): string {
  let text = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    text += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(text);
}
