import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hmacSha256, sameText, sha256 } from '../src/hmac.ts';

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const text = (s: string) => new TextEncoder().encode(s);

/** Bytes from a fixed sequence (a linear congruential generator): the same inputs on every run. */
function bytesFrom(seed: number, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let x = seed >>> 0;
  for (let i = 0; i < length; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    out[i] = x >>> 24;
  }
  return out;
}

describe('SHA-256 and HMAC-SHA256', () => {
  it('give the standards’ own examples (FIPS 180-4, RFC 4231)', () => {
    expect(hex(sha256(text('')))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(hex(sha256(text('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hex(sha256(text('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
    expect(hmacSha256(new Uint8Array(20).fill(0x0b), 'Hi There')).toBe(
      'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
    );
    expect(hmacSha256('Jefe', 'what do ya want for nothing?')).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    );
    // A key longer than a block is hashed first.
    expect(
      hmacSha256(new Uint8Array(131).fill(0xaa), 'Test Using Larger Than Block-Size Key - Hash Key First'),
    ).toBe('60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54');
  });

  it('agree with Node’s crypto at every length around the block edges, and on text beyond ASCII', () => {
    for (let length = 0; length <= 200; length++) {
      const data = bytesFrom(length + 1, length);
      expect(hex(sha256(data)), `length ${length}`).toBe(createHash('sha256').update(data).digest('hex'));
      const key = bytesFrom(length + 1000, length % 97);
      expect(hmacSha256(key, data), `length ${length}`).toBe(
        createHmac('sha256', key).update(data).digest('hex'),
      );
    }
    const message = '["d1b4e2a0","presenter","presenter-1",7,{"t":"state","note":"→ Ünïcödé 🎞"}]';
    const token = '0123456789abcdef0123456789abcdef';
    expect(hmacSha256(token, message)).toBe(
      createHmac('sha256', token).update(message, 'utf8').digest('hex'),
    );
  });

  it('compares proofs whole', () => {
    expect(sameText('abc', 'abc')).toBe(true);
    expect(sameText('abc', 'abd')).toBe(false);
    expect(sameText('abc', 'ab')).toBe(false);
    expect(sameText('', '')).toBe(true);
  });
});
