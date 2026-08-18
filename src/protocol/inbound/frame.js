import {decodeMsgpack} from "../codec/msgpack.js";
import {toUint8Array} from "../codec/binary.js";

// Convert a websocket payload into the transport-independent packet object
// consumed by the client and state reducers.
export function decodeIncomingFrame(data) {
    return typeof data === "string" ? JSON.parse(data) : decodeMsgpack(toUint8Array(data));
}
