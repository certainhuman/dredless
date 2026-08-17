export function decryptPayload(wireBytes: Uint8Array | ArrayBuffer | number[], worldId: number, seed: number): Uint8Array;
export function chacha20(key: Uint8Array, nonce: Uint8Array, length: number): Uint8Array;
/** Generates the keystream and XORs it with `data` in a single pass. */
export function chacha20Xor(key: Uint8Array, nonce: Uint8Array, data: Uint8Array): Uint8Array;
export function rotl32(x: number, n: number): number;
export function rotr32(x: number, n: number): number;
export function quarterRound(state: Uint32Array, a: number, b: number, c: number, d: number): void;

export type ChaCha20Backend = (
  key: Uint8Array,
  nonce: Uint8Array,
  out: Uint8Array,
  source?: Uint8Array
) => Uint8Array | null;

/**
 * Installs a faster backend for large payloads. Node's entry point wires this to
 * OpenSSL's `chacha20`; pass null to restore the portable implementation.
 */
export function installNativeChaCha20(cipherFactory: ChaCha20Backend | null): void;
