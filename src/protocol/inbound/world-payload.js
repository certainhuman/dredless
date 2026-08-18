import {decompressLz4Frame} from "../../compression/lz4.js";
import {decryptPayload} from "../../crypto/chacha.js";
import {decodeMsgpack} from "../codec/msgpack.js";

export function decodeWorldPayload(data, worldId, seed) {
    if (!data || seed == null) return null;
    try {
        return decodeMsgpack(decryptPayload(data, worldId, seed));
    } catch (_) {
        return null;
    }
}

export function decodeModelPayload(data, worldId, seed) {
    if (!data || seed == null) throw new Error("Encrypted model payload requires a world seed");
    return decryptPayload(data, worldId, seed);
}

export function decompressWorldChunk(data) {
    return decompressLz4Frame(data);
}
