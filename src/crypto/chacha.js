import { encoder, SHARED_CHACHA_MATERIAL } from "../constants.js";
import { toUint8Array } from "../protocol/binary.js";

function rotl32(x, n) {
  n &= 31;
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

function rotr32(x, n) {
  n &= 31;
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

function quarterRound(state, a, b, c, d) {
  state[a] = (state[a] + state[b]) >>> 0; state[d] ^= state[a]; state[d] = rotl32(state[d], 16);
  state[c] = (state[c] + state[d]) >>> 0; state[b] ^= state[c]; state[b] = rotl32(state[b], 12);
  state[a] = (state[a] + state[b]) >>> 0; state[d] ^= state[a]; state[d] = rotl32(state[d], 8);
  state[c] = (state[c] + state[d]) >>> 0; state[b] ^= state[c]; state[b] = rotl32(state[b], 7);
}

// Optional native backend. Node's OpenSSL exposes a raw `chacha20` stream cipher
// whose keystream is identical to this implementation, and it is ~27x faster on
// large payloads. It is installed by src/node.js rather than imported here so
// that browser bundles never see a `node:crypto` specifier.
let nativeBlockCipher = null;

function installNativeChaCha20(cipherFactory) {
  nativeBlockCipher = typeof cipherFactory === "function" ? cipherFactory : null;
}

// Native call overhead dominates below roughly this size; measured crossover is
// near 150 bytes, so stay in JS for the small per-tick payloads.
const NATIVE_MIN_BYTES = 256;

// Reused across blocks: the keystream words for one 64-byte block. Safe because
// generation is synchronous and single-threaded.
const SCRATCH_BLOCK = new Uint32Array(16);

function readLe32(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

// Writes `length` keystream bytes into `out` starting at 0, XORing against
// `source` when supplied. Keeping generation and XOR in one pass avoids
// allocating a full second buffer for the keystream.
function chacha20Into(out, key, nonce, length, source) {
  const k0 = readLe32(key, 0), k1 = readLe32(key, 4), k2 = readLe32(key, 8), k3 = readLe32(key, 12);
  const k4 = readLe32(key, 16), k5 = readLe32(key, 20), k6 = readLe32(key, 24), k7 = readLe32(key, 28);
  const n0 = readLe32(nonce, 0), n1 = readLe32(nonce, 4), n2 = readLe32(nonce, 8);

  let counter = 0;
  let offset = 0;
  const block = SCRATCH_BLOCK;

  while (offset < length) {
    let x0 = 0x61707865, x1 = 0x3320646e, x2 = 0x79622d32, x3 = 0x6b206574;
    let x4 = k0, x5 = k1, x6 = k2, x7 = k3;
    let x8 = k4, x9 = k5, x10 = k6, x11 = k7;
    let x12 = counter, x13 = n0, x14 = n1, x15 = n2;

    for (let i = 0; i < 10; i++) {
      // column rounds
      x0 = (x0 + x4) >>> 0; x12 ^= x0; x12 = (x12 << 16) | (x12 >>> 16);
      x8 = (x8 + x12) >>> 0; x4 ^= x8; x4 = (x4 << 12) | (x4 >>> 20);
      x0 = (x0 + x4) >>> 0; x12 ^= x0; x12 = (x12 << 8) | (x12 >>> 24);
      x8 = (x8 + x12) >>> 0; x4 ^= x8; x4 = (x4 << 7) | (x4 >>> 25);

      x1 = (x1 + x5) >>> 0; x13 ^= x1; x13 = (x13 << 16) | (x13 >>> 16);
      x9 = (x9 + x13) >>> 0; x5 ^= x9; x5 = (x5 << 12) | (x5 >>> 20);
      x1 = (x1 + x5) >>> 0; x13 ^= x1; x13 = (x13 << 8) | (x13 >>> 24);
      x9 = (x9 + x13) >>> 0; x5 ^= x9; x5 = (x5 << 7) | (x5 >>> 25);

      x2 = (x2 + x6) >>> 0; x14 ^= x2; x14 = (x14 << 16) | (x14 >>> 16);
      x10 = (x10 + x14) >>> 0; x6 ^= x10; x6 = (x6 << 12) | (x6 >>> 20);
      x2 = (x2 + x6) >>> 0; x14 ^= x2; x14 = (x14 << 8) | (x14 >>> 24);
      x10 = (x10 + x14) >>> 0; x6 ^= x10; x6 = (x6 << 7) | (x6 >>> 25);

      x3 = (x3 + x7) >>> 0; x15 ^= x3; x15 = (x15 << 16) | (x15 >>> 16);
      x11 = (x11 + x15) >>> 0; x7 ^= x11; x7 = (x7 << 12) | (x7 >>> 20);
      x3 = (x3 + x7) >>> 0; x15 ^= x3; x15 = (x15 << 8) | (x15 >>> 24);
      x11 = (x11 + x15) >>> 0; x7 ^= x11; x7 = (x7 << 7) | (x7 >>> 25);

      // diagonal rounds
      x0 = (x0 + x5) >>> 0; x15 ^= x0; x15 = (x15 << 16) | (x15 >>> 16);
      x10 = (x10 + x15) >>> 0; x5 ^= x10; x5 = (x5 << 12) | (x5 >>> 20);
      x0 = (x0 + x5) >>> 0; x15 ^= x0; x15 = (x15 << 8) | (x15 >>> 24);
      x10 = (x10 + x15) >>> 0; x5 ^= x10; x5 = (x5 << 7) | (x5 >>> 25);

      x1 = (x1 + x6) >>> 0; x12 ^= x1; x12 = (x12 << 16) | (x12 >>> 16);
      x11 = (x11 + x12) >>> 0; x6 ^= x11; x6 = (x6 << 12) | (x6 >>> 20);
      x1 = (x1 + x6) >>> 0; x12 ^= x1; x12 = (x12 << 8) | (x12 >>> 24);
      x11 = (x11 + x12) >>> 0; x6 ^= x11; x6 = (x6 << 7) | (x6 >>> 25);

      x2 = (x2 + x7) >>> 0; x13 ^= x2; x13 = (x13 << 16) | (x13 >>> 16);
      x8 = (x8 + x13) >>> 0; x7 ^= x8; x7 = (x7 << 12) | (x7 >>> 20);
      x2 = (x2 + x7) >>> 0; x13 ^= x2; x13 = (x13 << 8) | (x13 >>> 24);
      x8 = (x8 + x13) >>> 0; x7 ^= x8; x7 = (x7 << 7) | (x7 >>> 25);

      x3 = (x3 + x4) >>> 0; x14 ^= x3; x14 = (x14 << 16) | (x14 >>> 16);
      x9 = (x9 + x14) >>> 0; x4 ^= x9; x4 = (x4 << 12) | (x4 >>> 20);
      x3 = (x3 + x4) >>> 0; x14 ^= x3; x14 = (x14 << 8) | (x14 >>> 24);
      x9 = (x9 + x14) >>> 0; x4 ^= x9; x4 = (x4 << 7) | (x4 >>> 25);
    }

    block[0] = (x0 + 0x61707865) >>> 0; block[1] = (x1 + 0x3320646e) >>> 0;
    block[2] = (x2 + 0x79622d32) >>> 0; block[3] = (x3 + 0x6b206574) >>> 0;
    block[4] = (x4 + k0) >>> 0; block[5] = (x5 + k1) >>> 0;
    block[6] = (x6 + k2) >>> 0; block[7] = (x7 + k3) >>> 0;
    block[8] = (x8 + k4) >>> 0; block[9] = (x9 + k5) >>> 0;
    block[10] = (x10 + k6) >>> 0; block[11] = (x11 + k7) >>> 0;
    block[12] = (x12 + counter) >>> 0; block[13] = (x13 + n0) >>> 0;
    block[14] = (x14 + n1) >>> 0; block[15] = (x15 + n2) >>> 0;

    const remaining = length - offset;
    if (remaining >= 64) {
      if (source) {
        for (let w = 0; w < 16; w++) {
          const word = block[w];
          out[offset] = source[offset] ^ (word & 0xff);
          out[offset + 1] = source[offset + 1] ^ ((word >>> 8) & 0xff);
          out[offset + 2] = source[offset + 2] ^ ((word >>> 16) & 0xff);
          out[offset + 3] = source[offset + 3] ^ ((word >>> 24) & 0xff);
          offset += 4;
        }
      } else {
        for (let w = 0; w < 16; w++) {
          const word = block[w];
          out[offset] = word & 0xff;
          out[offset + 1] = (word >>> 8) & 0xff;
          out[offset + 2] = (word >>> 16) & 0xff;
          out[offset + 3] = (word >>> 24) & 0xff;
          offset += 4;
        }
      }
    } else {
      for (let i = 0; i < remaining; i++, offset++) {
        const stream = (block[i >> 2] >>> ((i & 3) * 8)) & 0xff;
        out[offset] = source ? source[offset] ^ stream : stream;
      }
    }
    counter++;
  }

  return out;
}

function chacha20(key, nonce, length) {
  const out = new Uint8Array(length);
  if (length <= 0) return out;
  if (nativeBlockCipher && length >= NATIVE_MIN_BYTES) {
    const native = nativeBlockCipher(key, nonce, out);
    if (native) return native;
  }
  return chacha20Into(out, key, nonce, length, null);
}

// XORs `data` with the keystream in a single pass, without materialising the
// keystream in a separate buffer.
function chacha20Xor(key, nonce, data) {
  const out = new Uint8Array(data.length);
  if (data.length === 0) return out;
  if (nativeBlockCipher && data.length >= NATIVE_MIN_BYTES) {
    const native = nativeBlockCipher(key, nonce, out, data);
    if (native) return native;
  }
  return chacha20Into(out, key, nonce, data.length, data);
}

function decryptPayload(wireBytes, worldId, seed) {
  const wire = toUint8Array(wireBytes);
  if (wire.length < 8) throw new Error("payload too short");
  const view = new DataView(wire.buffer, wire.byteOffset, wire.byteLength);
  const packetWordA = view.getUint32(0, true);
  const packetWordB = view.getUint32(wire.length - 4, true);
  const material = Uint8Array.from(SHARED_CHACHA_MATERIAL);
  const worldKey = encoder.encode(`${worldId}${seed}`);
  for (let i = 0, l = 0, r = 0; i < 44; i++, l += 7, r += 11) {
    material[i] ^= worldKey[i % worldKey.length] ^ (rotl32(packetWordA, l) & 0xff) ^ (rotr32(packetWordB, r) & 0xff);
  }
  // subarray, not slice: the key and nonce are only read.
  const ciphertext = wire.subarray(4, wire.length - 4);
  return chacha20Xor(material.subarray(0, 32), material.subarray(32, 44), ciphertext);
}


export {
  rotl32,
  rotr32,
  quarterRound,
  chacha20,
  chacha20Xor,
  decryptPayload,
  installNativeChaCha20
};
