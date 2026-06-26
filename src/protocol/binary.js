import { encoder } from "../constants.js";

function objectTag(value) {
  return Object.prototype.toString.call(value);
}

function isArrayBufferLike(value) {
  const tag = objectTag(value);
  return tag === "[object ArrayBuffer]" || tag === "[object SharedArrayBuffer]";
}

function toUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (isArrayBufferLike(value)) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }
  if (Array.isArray(value)) return Uint8Array.from(value);
  if (typeof value === "string") return encoder.encode(value);
  throw new Error(`Unsupported binary value: ${objectTag(value)}`);
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function valuesEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a !== "object" || typeof b !== "object") return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!valuesEqual(a[key], b[key])) return false;
  }
  return true;
}


export {
  toUint8Array,
  concatBytes,
  valuesEqual
};
