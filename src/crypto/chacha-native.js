// Node-only ChaCha20 backend.
//
// OpenSSL exposes a raw `chacha20` stream cipher whose keystream matches
// src/crypto/chacha.js exactly, and it is roughly 27x faster on 64 KB payloads.
// This module is imported only from src/node.js so that browser bundles never
// encounter a `node:crypto` specifier.
import { createCipheriv, getCiphers } from "node:crypto";

import { installNativeChaCha20 } from "./chacha.js";

// OpenSSL takes a 16-byte IV: a 32-bit little-endian block counter followed by
// the 12-byte nonce. The JS implementation starts its counter at zero.
function buildIv(nonce) {
  const iv = new Uint8Array(16);
  iv.set(nonce, 4);
  return iv;
}

function nativeChaCha20(key, nonce, out, source) {
  try {
    const cipher = createCipheriv("chacha20", key, buildIv(nonce));
    const input = source ?? new Uint8Array(out.length);
    const head = cipher.update(input);
    const tail = cipher.final();
    if (head.length) out.set(head, 0);
    if (tail.length) out.set(tail, head.length);
    return out;
  } catch (_) {
    // Fall back to the portable implementation.
    return null;
  }
}

function enableNativeChaCha20() {
  try {
    if (!getCiphers().includes("chacha20")) return false;
  } catch (_) {
    return false;
  }
  installNativeChaCha20(nativeChaCha20);
  return true;
}


export {
  enableNativeChaCha20,
  nativeChaCha20
};
