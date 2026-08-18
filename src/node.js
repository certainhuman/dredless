import {enableNativeChaCha20} from "./crypto/chacha-native.js";

// Node resolves the package root through this entry, so opting into the native
// ChaCha20 backend here keeps `node:crypto` out of the browser build.
enableNativeChaCha20();

export * from "./index.js";
export {default} from "./index.js";
