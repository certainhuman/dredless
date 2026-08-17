import { decoder, encoder, COMMAND_FIELDS, COMMAND_DEFAULT_FORMATS } from "../constants.js";
import { toUint8Array, concatBytes, valuesEqual } from "./binary.js";

function cloneDragValue(drag) {
  if (!drag || typeof drag !== "object") return null;
  return {
    source: Number(drag.source),
    target: Number(drag.target),
    split: Boolean(drag.split)
  };
}

function cloneCommand(command) {
  const out = {};
  for (const key of COMMAND_FIELDS) {
    out[key] = key === "drag" ? cloneDragValue(command[key]) : command[key];
  }
  return out;
}

function encodeStringBytes(text) {
  const bytes = encoder.encode(String(text));
  const length = bytes.length;
  if (length <= 31) {
    const out = new Uint8Array(1 + length);
    out[0] = 0xa0 | length;
    out.set(bytes, 1);
    return out;
  }
  if (length <= 0xff) {
    const out = new Uint8Array(2 + length);
    out[0] = 0xd9;
    out[1] = length;
    out.set(bytes, 2);
    return out;
  }
  const out = new Uint8Array(3 + length);
  out[0] = 0xda;
  out[1] = (length >>> 8) & 0xff;
  out[2] = length & 0xff;
  out.set(bytes, 3);
  return out;
}

function encodeNumberWithFormat(value, format) {
  const number = Number(value);
  switch (format) {
    case "positive-fixint":
      return Uint8Array.of(number & 0x7f);
    case "negative-fixint":
      return Uint8Array.of(number & 0xff);
    case "uint8":
      return Uint8Array.of(0xcc, number & 0xff);
    case "uint16":
      return Uint8Array.of(0xcd, (number >>> 8) & 0xff, number & 0xff);
    case "uint32":
      return Uint8Array.of(0xce, (number >>> 24) & 0xff, (number >>> 16) & 0xff, (number >>> 8) & 0xff, number & 0xff);
    case "int8":
      return Uint8Array.of(0xd0, number & 0xff);
    case "int16":
      return Uint8Array.of(0xd1, (number >> 8) & 0xff, number & 0xff);
    case "int32":
      return Uint8Array.of(0xd2, (number >> 24) & 0xff, (number >> 16) & 0xff, (number >> 8) & 0xff, number & 0xff);
    case "float64": {
      const out = new Uint8Array(9);
      out[0] = 0xcb;
      new DataView(out.buffer).setFloat64(1, number, false);
      return out;
    }
    case "float32":
    default: {
      const out = new Uint8Array(5);
      out[0] = 0xca;
      new DataView(out.buffer).setFloat32(1, number, false);
      return out;
    }
  }
}

function encodeMapHeader(length, originalHeaderBytes = null) {
  if (originalHeaderBytes && originalHeaderBytes.length > 0) return originalHeaderBytes;
  if (length <= 15) return Uint8Array.of(0x80 | length);
  return Uint8Array.of(0xde, (length >>> 8) & 0xff, length & 0xff);
}

function encodeValue(key, value, entry) {
  if (entry && valuesEqual(value, entry.valueNode.value)) return entry.valueNode.raw;
  if (value == null) return Uint8Array.of(0xc0);
  if (typeof value === "boolean") return Uint8Array.of(value ? 0xc3 : 0xc2);
  if (typeof value === "number") {
    const schemaFormat = COMMAND_DEFAULT_FORMATS[key];
    let format = schemaFormat && schemaFormat !== "nil" ? schemaFormat : null;
    if (!format) {
      if (!Number.isInteger(value)) format = "float32";
      else if (value >= 0) {
        if (value <= 0x7f) format = "positive-fixint";
        else if (value <= 0xff) format = "uint8";
        else if (value <= 0xffff) format = "uint16";
        else format = "uint32";
      } else if (value >= -32) format = "negative-fixint";
      else if (value >= -128) format = "int8";
      else if (value >= -32768) format = "int16";
      else format = "int32";
    }
    return encodeNumberWithFormat(value, format);
  }
  if (typeof value === "string") return encodeStringBytes(value);
  if (key === "drag" && typeof value === "object") {
    const sourceEntry = entry?.valueNode?.entries?.find((item) => String(item.key) === "source")?.valueNode;
    const targetEntry = entry?.valueNode?.entries?.find((item) => String(item.key) === "target")?.valueNode;
    return concatBytes([
      Uint8Array.of(0x83),
      encodeStringBytes("source"),
      encodeNumberWithFormat(Number(value.source || 0), sourceEntry?.format || "positive-fixint"),
      encodeStringBytes("target"),
      encodeNumberWithFormat(Number(value.target || 0), targetEntry?.format || "positive-fixint"),
      encodeStringBytes("split"),
      Uint8Array.of(Boolean(value.split) ? 0xc3 : 0xc2)
    ]);
  }
  throw new Error(`Unsupported command field "${key}"`);
}

function decodeValue(bytes, offset = 0) {
  const head = bytes[offset++];
  if (head <= 0x7f) return { value: head, format: "positive-fixint", offset, raw: bytes.slice(offset - 1, offset) };
  if (head >= 0xe0) return { value: (head << 24) >> 24, format: "negative-fixint", offset, raw: bytes.slice(offset - 1, offset) };
  if ((head & 0xf0) === 0x80) {
    const count = head & 0x0f;
    const entries = [];
    const obj = {};
    for (let i = 0; i < count; i++) {
      const keyNode = decodeValue(bytes, offset);
      offset = keyNode.offset;
      const valueNode = decodeValue(bytes, offset);
      offset = valueNode.offset;
      entries.push({ key: keyNode.value, keyNode, valueNode });
      obj[String(keyNode.value)] = valueNode.value;
    }
    return { value: obj, format: "fixmap", entries, headerBytes: bytes.slice(offset - 1 - (count * 2), offset), offset, raw: bytes.slice(offset - (offset - (offset - 1)), offset) };
  }
  if ((head & 0xf0) === 0x90) {
    const count = head & 0x0f;
    const items = [];
    for (let i = 0; i < count; i++) {
      const item = decodeValue(bytes, offset);
      offset = item.offset;
      items.push(item);
    }
    return { value: items.map((item) => item.value), format: "fixarray", items, offset, raw: bytes.slice(0, offset) };
  }
  if ((head & 0xe0) === 0xa0) {
    const len = head & 0x1f;
    const start = offset;
    const end = start + len;
    return { value: decoder.decode(bytes.slice(start, end)), format: "fixstr", offset: end, raw: bytes.slice(offset - 1, end) };
  }
  switch (head) {
    case 0xc0:
      return { value: null, format: "nil", offset, raw: bytes.slice(offset - 1, offset) };
    case 0xc2:
      return { value: false, format: "bool", offset, raw: bytes.slice(offset - 1, offset) };
    case 0xc3:
      return { value: true, format: "bool", offset, raw: bytes.slice(offset - 1, offset) };
    case 0xc4: {
      const len = bytes[offset++];
      const start = offset;
      const end = start + len;
      return { value: bytes.slice(start, end), format: "bin8", offset: end, raw: bytes.slice(start - 2, end) };
    }
    case 0xc5: {
      const len = (bytes[offset] << 8) | bytes[offset + 1];
      offset += 2;
      const start = offset;
      const end = start + len;
      return { value: bytes.slice(start, end), format: "bin16", offset: end, raw: bytes.slice(start - 3, end) };
    }
    case 0xc6: {
      const len = (bytes[offset] * 0x1000000) + ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]);
      offset += 4;
      const start = offset;
      const end = start + len;
      return { value: bytes.slice(start, end), format: "bin32", offset: end, raw: bytes.slice(start - 5, end) };
    }
    case 0xca:
      return { value: new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getFloat32(0, false), format: "float32", offset: offset + 4, raw: bytes.slice(offset - 1, offset + 4) };
    case 0xcb:
      return { value: new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getFloat64(0, false), format: "float64", offset: offset + 8, raw: bytes.slice(offset - 1, offset + 8) };
    case 0xcc:
      return { value: bytes[offset], format: "uint8", offset: offset + 1, raw: bytes.slice(offset - 1, offset + 1) };
    case 0xcd:
      return { value: (bytes[offset] << 8) | bytes[offset + 1], format: "uint16", offset: offset + 2, raw: bytes.slice(offset - 1, offset + 2) };
    case 0xce:
      return {
        value: (((bytes[offset] * 0x1000000) + ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3])) >>> 0),
        format: "uint32",
        offset: offset + 4,
        raw: bytes.slice(offset - 1, offset + 4)
      };
    case 0xd0:
      return { value: (bytes[offset] << 24) >> 24, format: "int8", offset: offset + 1, raw: bytes.slice(offset - 1, offset + 1) };
    case 0xd1:
      return { value: new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getInt16(0, false), format: "int16", offset: offset + 2, raw: bytes.slice(offset - 1, offset + 2) };
    case 0xd2:
      return { value: new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getInt32(0, false), format: "int32", offset: offset + 4, raw: bytes.slice(offset - 1, offset + 4) };
    case 0xd9: {
      const len = bytes[offset++];
      const start = offset;
      const end = start + len;
      return { value: decoder.decode(bytes.slice(start, end)), format: "str8", offset: end, raw: bytes.slice(start - 2, end) };
    }
    case 0xda: {
      const len = (bytes[offset] << 8) | bytes[offset + 1];
      offset += 2;
      const start = offset;
      const end = start + len;
      return { value: decoder.decode(bytes.slice(start, end)), format: "str16", offset: end, raw: bytes.slice(start - 3, end) };
    }
    case 0xdc: {
      const count = (bytes[offset] << 8) | bytes[offset + 1];
      offset += 2;
      const items = [];
      for (let i = 0; i < count; i++) {
        const item = decodeValue(bytes, offset);
        offset = item.offset;
        items.push(item);
      }
      return { value: items.map((item) => item.value), format: "array16", items, offset, raw: bytes.slice(0, offset) };
    }
    case 0xde: {
      const count = (bytes[offset] << 8) | bytes[offset + 1];
      offset += 2;
      const entries = [];
      const obj = {};
      for (let i = 0; i < count; i++) {
        const keyNode = decodeValue(bytes, offset);
        offset = keyNode.offset;
        const valueNode = decodeValue(bytes, offset);
        offset = valueNode.offset;
        entries.push({ key: keyNode.value, keyNode, valueNode });
        obj[String(keyNode.value)] = valueNode.value;
      }
      return { value: obj, format: "map16", entries, offset, raw: bytes.slice(0, offset) };
    }
    default:
      throw new Error(`Unsupported msgpack token 0x${head.toString(16)}`);
  }
}

// Value-only decoder used for all inbound traffic.
//
// `decodeValue` above annotates every node with its `raw` byte slice and format
// so outgoing commands can be re-encoded byte-for-byte. Containers slice from
// the start of the buffer, which makes decoding quadratic in packet size, and
// `decodeMsgpack` discarded all of it. This path allocates only the decoded
// values. The annotated decoder stays exported for the command-signing path and
// external tooling.
let cursor = 0;

function readFast(bytes) {
  const head = bytes[cursor++];

  if (head <= 0x7f) return head;
  if (head >= 0xe0) return (head << 24) >> 24;

  if ((head & 0xf0) === 0x80) return readMapFast(bytes, head & 0x0f);
  if ((head & 0xf0) === 0x90) return readArrayFast(bytes, head & 0x0f);
  if ((head & 0xe0) === 0xa0) return readStrFast(bytes, head & 0x1f);

  switch (head) {
    case 0xc0: return null;
    case 0xc2: return false;
    case 0xc3: return true;
    case 0xc4: return readBinFast(bytes, bytes[cursor++]);
    case 0xc5: {
      const len = (bytes[cursor] << 8) | bytes[cursor + 1];
      cursor += 2;
      return readBinFast(bytes, len);
    }
    case 0xc6: {
      const len = (bytes[cursor] * 0x1000000) + ((bytes[cursor + 1] << 16) | (bytes[cursor + 2] << 8) | bytes[cursor + 3]);
      cursor += 4;
      return readBinFast(bytes, len);
    }
    case 0xca: {
      const value = new DataView(bytes.buffer, bytes.byteOffset + cursor, 4).getFloat32(0, false);
      cursor += 4;
      return value;
    }
    case 0xcb: {
      const value = new DataView(bytes.buffer, bytes.byteOffset + cursor, 8).getFloat64(0, false);
      cursor += 8;
      return value;
    }
    case 0xcc: return bytes[cursor++];
    case 0xcd: {
      const value = (bytes[cursor] << 8) | bytes[cursor + 1];
      cursor += 2;
      return value;
    }
    case 0xce: {
      const value = (((bytes[cursor] * 0x1000000) + ((bytes[cursor + 1] << 16) | (bytes[cursor + 2] << 8) | bytes[cursor + 3])) >>> 0);
      cursor += 4;
      return value;
    }
    case 0xd0: return (bytes[cursor++] << 24) >> 24;
    case 0xd1: {
      const value = ((((bytes[cursor] << 8) | bytes[cursor + 1]) << 16) >> 16);
      cursor += 2;
      return value;
    }
    case 0xd2: {
      const value = ((bytes[cursor] << 24) | (bytes[cursor + 1] << 16) | (bytes[cursor + 2] << 8) | bytes[cursor + 3]) | 0;
      cursor += 4;
      return value;
    }
    case 0xd9: return readStrFast(bytes, bytes[cursor++]);
    case 0xda: {
      const len = (bytes[cursor] << 8) | bytes[cursor + 1];
      cursor += 2;
      return readStrFast(bytes, len);
    }
    case 0xdc: {
      const count = (bytes[cursor] << 8) | bytes[cursor + 1];
      cursor += 2;
      return readArrayFast(bytes, count);
    }
    case 0xde: {
      const count = (bytes[cursor] << 8) | bytes[cursor + 1];
      cursor += 2;
      return readMapFast(bytes, count);
    }
    default:
      throw new Error(`Unsupported msgpack token 0x${head.toString(16)}`);
  }
}

function readStrFast(bytes, len) {
  const start = cursor;
  cursor += len;
  // subarray, not slice: TextDecoder copies into the result string anyway.
  return decoder.decode(bytes.subarray(start, cursor));
}

function readBinFast(bytes, len) {
  const start = cursor;
  cursor += len;
  // slice, not subarray: callers retain these payloads past the socket buffer.
  return bytes.slice(start, cursor);
}

function readArrayFast(bytes, count) {
  const items = new Array(count);
  for (let i = 0; i < count; i++) items[i] = readFast(bytes);
  return items;
}

function readMapFast(bytes, count) {
  const obj = {};
  for (let i = 0; i < count; i++) {
    const key = readFast(bytes);
    obj[typeof key === "string" ? key : String(key)] = readFast(bytes);
  }
  return obj;
}

function decodeMsgpack(bytes) {
  const input = toUint8Array(bytes);
  cursor = 0;
  return readFast(input);
}

// Growable output buffer. The recursive encoder used to build an array of small
// Uint8Array fragments per value and concatenate them at every nesting level.
class MsgpackWriter {
  constructor(capacity = 256) {
    this.bytes = new Uint8Array(capacity);
    this.length = 0;
  }

  #reserve(extra) {
    const needed = this.length + extra;
    if (needed <= this.bytes.length) return;
    let size = this.bytes.length || 64;
    while (size < needed) size *= 2;
    const grown = new Uint8Array(size);
    grown.set(this.bytes.subarray(0, this.length));
    this.bytes = grown;
  }

  byte(value) {
    this.#reserve(1);
    this.bytes[this.length++] = value & 0xff;
    return this;
  }

  raw(chunk) {
    this.#reserve(chunk.length);
    this.bytes.set(chunk, this.length);
    this.length += chunk.length;
    return this;
  }

  result() {
    return this.bytes.slice(0, this.length);
  }
}

function writeMsgpack(writer, value) {
  if (value == null) return writer.byte(0xc0);
  if (typeof value === "boolean") return writer.byte(value ? 0xc3 : 0xc2);
  if (typeof value === "number") return writer.raw(encodeMsgpackNumber(value));
  if (typeof value === "string") return writer.raw(encodeStringBytes(value));

  if (value instanceof Uint8Array || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    const bytes = toUint8Array(value);
    if (bytes.length <= 0xff) writer.byte(0xc4).byte(bytes.length);
    else if (bytes.length <= 0xffff) writer.byte(0xc5).byte(bytes.length >>> 8).byte(bytes.length);
    else writer.byte(0xc6).byte(bytes.length >>> 24).byte(bytes.length >>> 16).byte(bytes.length >>> 8).byte(bytes.length);
    return writer.raw(bytes);
  }

  if (Array.isArray(value)) {
    const len = value.length;
    if (len <= 15) writer.byte(0x90 | len);
    else writer.byte(0xdc).byte(len >>> 8).byte(len);
    for (const item of value) writeMsgpack(writer, item);
    return writer;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length <= 15) writer.byte(0x80 | entries.length);
    else writer.byte(0xde).byte(entries.length >>> 8).byte(entries.length);
    for (const [key, val] of entries) {
      writer.raw(encodeStringBytes(key));
      writeMsgpack(writer, val);
    }
    return writer;
  }

  throw new Error(`Unsupported msgpack value: ${typeof value}`);
}

function encodeMsgpackNumber(value) {
  if (!Number.isInteger(value)) return encodeNumberWithFormat(value, "float32");
  if (value >= 0) {
    if (value <= 0x7f) return encodeNumberWithFormat(value, "positive-fixint");
    if (value <= 0xff) return encodeNumberWithFormat(value, "uint8");
    if (value <= 0xffff) return encodeNumberWithFormat(value, "uint16");
    return encodeNumberWithFormat(value, "uint32");
  }
  if (value >= -32) return encodeNumberWithFormat(value, "negative-fixint");
  if (value >= -128) return encodeNumberWithFormat(value, "int8");
  if (value >= -32768) return encodeNumberWithFormat(value, "int16");
  return encodeNumberWithFormat(value, "int32");
}

function encodeMsgpack(value) {
  // Scalars need no buffer at all.
  if (value == null) return Uint8Array.of(0xc0);
  if (typeof value === "boolean") return Uint8Array.of(value ? 0xc3 : 0xc2);
  if (typeof value === "number") return encodeMsgpackNumber(value);
  if (typeof value === "string") return encodeStringBytes(value);
  const writer = new MsgpackWriter();
  writeMsgpack(writer, value);
  return writer.result();
}

export {
  cloneDragValue,
  cloneCommand,
  encodeStringBytes,
  encodeNumberWithFormat,
  encodeMapHeader,
  encodeValue,
  decodeValue,
  decodeMsgpack,
  encodeMsgpack
};
