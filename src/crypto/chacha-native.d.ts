import type { ChaCha20Backend } from "./chacha.js";

/**
 * Node-only. Installs OpenSSL's `chacha20` as the ChaCha20 backend when it is
 * available. Returns false when the cipher is not present in this build.
 */
export function enableNativeChaCha20(): boolean;
export const nativeChaCha20: ChaCha20Backend;
