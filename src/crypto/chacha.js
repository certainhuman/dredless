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

function chacha20(key, nonce, length) {
  const out = new Uint8Array(length);
  const constants = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574];
  let counter = 0;
  let offset = 0;
  while (offset < length) {
    const state = new Uint32Array(16);
    state.set(constants, 0);
    for (let i = 0; i < 8; i++) state[4 + i] = new DataView(key.buffer, key.byteOffset + i * 4, 4).getUint32(0, true);
    state[12] = counter++;
    for (let i = 0; i < 3; i++) state[13 + i] = new DataView(nonce.buffer, nonce.byteOffset + i * 4, 4).getUint32(0, true);
    const working = new Uint32Array(state);
    for (let i = 0; i < 10; i++) {
      quarterRound(working, 0, 4, 8, 12);
      quarterRound(working, 1, 5, 9, 13);
      quarterRound(working, 2, 6, 10, 14);
      quarterRound(working, 3, 7, 11, 15);
      quarterRound(working, 0, 5, 10, 15);
      quarterRound(working, 1, 6, 11, 12);
      quarterRound(working, 2, 7, 8, 13);
      quarterRound(working, 3, 4, 9, 14);
    }
    const block = new Uint8Array(64);
    const view = new DataView(block.buffer);
    for (let i = 0; i < 16; i++) view.setUint32(i * 4, (working[i] + state[i]) >>> 0, true);
    for (let i = 0; i < 64 && offset < length; i++, offset++) out[offset] = block[i];
  }
  return out;
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
  const ciphertext = wire.slice(4, wire.length - 4);
  const stream = chacha20(material.slice(0, 32), material.slice(32, 44), ciphertext.length);
  const plain = new Uint8Array(ciphertext.length);
  for (let i = 0; i < plain.length; i++) plain[i] = ciphertext[i] ^ stream[i];
  return plain;
}


export {
  rotl32,
  rotr32,
  quarterRound,
  chacha20,
  decryptPayload
};
