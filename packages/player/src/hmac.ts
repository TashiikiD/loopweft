// SHA-256 (FIPS 180-4) and HMAC (RFC 2104), for the proof each message between a presentation's windows carries
// (link.ts). Written here rather than taken from Web Crypto, which is asynchronous (a message must be checked as
// it arrives, in order) and which not every browser offers to a file opened from disk. The tests check it
// against the standards' own examples and against Node's crypto.

/** The first 32 bits of the fractional parts of the cube roots of the first 64 primes. */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
]);

/** The first 32 bits of the fractional parts of the square roots of the first 8 primes. */
const H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

/** The SHA-256 digest of `data`. */
export function sha256(data: Uint8Array): Uint8Array {
  // The message, a 1 bit, zeros, and its length in bits as 64 bits: a whole number of 64-byte blocks.
  const padded = new Uint8Array(((data.length + 9 + 63) >> 6) << 6);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bits = data.length * 8;
  view.setUint32(padded.length - 8, Math.floor(bits / 2 ** 32));
  view.setUint32(padded.length - 4, bits >>> 0);

  const h = new Uint32Array(H0);
  const w = new Uint32Array(64);
  for (let block = 0; block < padded.length; block += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(block + t * 4);
    for (let t = 16; t < 64; t++) {
      const a = w[t - 15] as number;
      const b = w[t - 2] as number;
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
      w[t] = (w[t - 16] as number) + s0 + (w[t - 7] as number) + s1;
    }
    const [h0, h1, h2, h3, h4, h5, h6, h7] = h;
    let a = h0 as number;
    let b = h1 as number;
    let c = h2 as number;
    let d = h3 as number;
    let e = h4 as number;
    let f = h5 as number;
    let g = h6 as number;
    let hh = h7 as number;
    for (let t = 0; t < 64; t++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + s1 + ch + (K[t] as number) + (w[t] as number)) | 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + maj) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    const end = [a, b, c, d, e, f, g, hh];
    // The typed array keeps each sum to 32 bits.
    for (let i = 0; i < 8; i++) h[i] = (h[i] as number) + (end[i] as number);
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, h[i] as number);
  return out;
}

const encoder = new TextEncoder();
const bytes = (v: string | Uint8Array): Uint8Array => (typeof v === 'string' ? encoder.encode(v) : v);

/** HMAC-SHA256 of `message` under `key`, as 64 hex digits. Text is taken as UTF-8. */
export function hmacSha256(key: string | Uint8Array, message: string | Uint8Array): string {
  let k = bytes(key);
  if (k.length > 64) k = sha256(k);
  const inner = new Uint8Array(64 + bytes(message).length);
  const outer = new Uint8Array(64 + 32);
  for (let i = 0; i < 64; i++) {
    const byte = k[i] ?? 0;
    inner[i] = byte ^ 0x36;
    outer[i] = byte ^ 0x5c;
  }
  inner.set(bytes(message), 64);
  outer.set(sha256(inner), 64);
  return [...sha256(outer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** True when two strings are the same, taking as long whatever their first difference (for proofs). */
export function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
