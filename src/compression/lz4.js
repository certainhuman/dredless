import { toUint8Array, concatBytes } from "../protocol/binary.js";

function decompressLz4Block(block) {
  const out = [];
  let pos = 0;
  while (pos < block.length) {
    const token = block[pos++];
    let literalLen = token >>> 4;
    if (literalLen === 15) {
      let b;
      do {
        if (pos >= block.length) throw new Error("truncated lz4 literal length");
        b = block[pos++];
        literalLen += b;
      } while (b === 255);
    }
    if (pos + literalLen > block.length) throw new Error("truncated lz4 literals");
    for (let i = 0; i < literalLen; i++) out.push(block[pos++]);
    if (pos >= block.length) break;
    if (pos + 2 > block.length) throw new Error("truncated lz4 offset");
    const offset = block[pos] | (block[pos + 1] << 8);
    pos += 2;
    if (offset === 0 || offset > out.length) throw new Error(`invalid lz4 offset ${offset}`);
    let matchLen = token & 0x0f;
    if (matchLen === 15) {
      let b;
      do {
        if (pos >= block.length) throw new Error("truncated lz4 match length");
        b = block[pos++];
        matchLen += b;
      } while (b === 255);
    }
    matchLen += 4;
    for (let i = 0; i < matchLen; i++) out.push(out[out.length - offset]);
  }
  return Uint8Array.from(out);
}

function decompressLz4Frame(bytes) {
  const buf = toUint8Array(bytes);
  if (buf.length < 7) return buf;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (view.getUint32(0, true) !== 0x184d2204) return buf;
  const flg = buf[4];
  let pos = 6;
  if (flg & 0x08) pos += 8;
  if (flg & 0x01) pos += 4;
  pos += 1;
  const chunks = [];
  while (pos + 4 <= buf.length) {
    const rawSize = view.getUint32(pos, true);
    pos += 4;
    if (rawSize === 0) break;
    const uncompressed = (rawSize & 0x80000000) !== 0;
    const size = rawSize & 0x7fffffff;
    if (pos + size > buf.length) throw new Error("truncated lz4 block");
    const block = buf.slice(pos, pos + size);
    chunks.push(uncompressed ? block : decompressLz4Block(block));
    pos += size;
    if (flg & 0x10) pos += 4;
  }
  return concatBytes(chunks);
}


export {
  decompressLz4Block,
  decompressLz4Frame
};
