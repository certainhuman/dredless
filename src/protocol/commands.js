import { encoder, COMMAND_FIELDS, COMMAND_DEFAULT_FORMATS } from "../constants.js";
import { concatBytes, toUint8Array } from "./binary.js";
import { cloneDragValue, encodeMapHeader, encodeStringBytes, encodeValue } from "./msgpack.js";

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

function buildCommandDefaults(command = {}) {
  const out = {};
  for (const key of COMMAND_FIELDS) {
    if (key === "drag") {
      out[key] = cloneDragValue(command[key]);
      continue;
    }
    if (command[key] !== undefined) out[key] = command[key];
    else if (COMMAND_DEFAULT_FORMATS[key] === "nil") out[key] = null;
    else if (COMMAND_DEFAULT_FORMATS[key] === "bool") out[key] = false;
    else if (COMMAND_DEFAULT_FORMATS[key] === "float32") out[key] = 0;
    else out[key] = 0;
  }
  out.type = command.type ?? 0;
  out.n = command.n ?? null;
  return out;
}

// Field names and the map header are identical for every command, so encode
// them once instead of on each send.
const COMMAND_MAP_HEADER = encodeMapHeader(COMMAND_FIELDS.length);
const COMMAND_FIELD_KEY_BYTES = COMMAND_FIELDS.map((key) => encodeStringBytes(key));

function buildCommandBody(command) {
  const normalized = buildCommandDefaults(command);
  const parts = [COMMAND_MAP_HEADER];
  for (let i = 0; i < COMMAND_FIELDS.length; i++) {
    parts.push(COMMAND_FIELD_KEY_BYTES[i]);
    parts.push(encodeValue(COMMAND_FIELDS[i], normalized[COMMAND_FIELDS[i]], null));
  }
  return concatBytes(parts);
}

// The prefix depends only on the session id, which is fixed for a connection.
let signaturePrefixSid = null;
let signaturePrefixBytes = null;

function buildSignaturePrefix(sessionId) {
  const sid = Number(sessionId) >>> 0;
  if (sid === signaturePrefixSid && signaturePrefixBytes) return signaturePrefixBytes;
  const a = (sid ^ 52481) >>> 0;
  const b = ((sid << 2) + 69) >>> 0;
  const c = ((((sid >>> 1) * 5) >>> 0) + 420) >>> 0;
  signaturePrefixBytes = encoder.encode(`MJAF${a}CANH${b}SCLJ${c}LODV`);
  signaturePrefixSid = sid;
  return signaturePrefixBytes;
}

function rightRotate(value, bits) {
  return (value >>> bits) | (value << (32 - bits));
}

function sha256(bytes) {
  const input = toUint8Array(bytes);
  const bitLength = input.length * 8;
  const paddingLength = ((56 - ((input.length + 1) % 64)) + 64) % 64;
  const padded = new Uint8Array(input.length + 1 + paddingLength + 8);
  padded.set(input, 0);
  padded[input.length] = 0x80;
  const view = new DataView(padded.buffer);
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  view.setUint32(padded.length - 8, high, false);
  view.setUint32(padded.length - 4, low, false);

  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ]);
  const schedule = new Uint32Array(64);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index++) schedule[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 64; index++) {
      const s0 = rightRotate(schedule[index - 15], 7) ^ rightRotate(schedule[index - 15], 18) ^ (schedule[index - 15] >>> 3);
      const s1 = rightRotate(schedule[index - 2], 17) ^ rightRotate(schedule[index - 2], 19) ^ (schedule[index - 2] >>> 10);
      schedule[index] = (((schedule[index - 16] + s0) >>> 0) + ((schedule[index - 7] + s1) >>> 0)) >>> 0;
    }

    let a = state[0], b = state[1], c = state[2], d = state[3], e = state[4], f = state[5], g = state[6], h = state[7];
    for (let index = 0; index < 64; index++) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (((((h + S1) >>> 0) + ch) >>> 0) + ((SHA256_K[index] + schedule[index]) >>> 0)) >>> 0;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, state[i], false);
  return out;
}

function signCommandBody(body, sessionId) {
  return sha256(concatBytes([buildSignaturePrefix(sessionId), body, encoder.encode("YXTG")]));
}

function buildSignedCommandPacket(command, sessionId) {
  const body = buildCommandBody(command);
  const signature = signCommandBody(body, sessionId);
  return concatBytes([body, signature]);
}


export {
  buildCommandDefaults,
  buildCommandBody,
  buildSignaturePrefix,
  rightRotate,
  sha256,
  signCommandBody,
  buildSignedCommandPacket
};
