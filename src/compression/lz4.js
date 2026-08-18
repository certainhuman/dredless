import {toUint8Array} from "../protocol/binary.js";

// Growable typed-array sink. LZ4 block headers carry the compressed size, not
// the decompressed size, so the output buffer starts at a generous multiple and
// doubles on demand rather than pushing into a plain array one byte at a time.
function ensureCapacity(buffer, needed) {
    if (needed <= buffer.length) return buffer;
    let size = buffer.length || 64;
    while (size < needed) size *= 2;
    const grown = new Uint8Array(size);
    grown.set(buffer);
    return grown;
}

function decompressLz4Block(block) {
    let out = new Uint8Array(Math.max(64, block.length * 4));
    let len = 0;
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
        if (literalLen > 0) {
            out = ensureCapacity(out, len + literalLen);
            out.set(block.subarray(pos, pos + literalLen), len);
            len += literalLen;
            pos += literalLen;
        }

        if (pos >= block.length) break;
        if (pos + 2 > block.length) throw new Error("truncated lz4 offset");
        const offset = block[pos] | (block[pos + 1] << 8);
        pos += 2;
        if (offset === 0 || offset > len) throw new Error(`invalid lz4 offset ${offset}`);

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

        out = ensureCapacity(out, len + matchLen);
        // Matches may overlap the region being written, so copy byte by byte rather
        // than with copyWithin, which would read the pre-copy bytes.
        let from = len - offset;
        for (let i = 0; i < matchLen; i++) out[len++] = out[from++];
    }

    // Return a compact standalone array, matching the previous contract: callers
    // must not see a view over a larger backing buffer.
    return out.length === len ? out : out.slice(0, len);
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
    let total = 0;
    while (pos + 4 <= buf.length) {
        const rawSize = view.getUint32(pos, true);
        pos += 4;
        if (rawSize === 0) break;
        const uncompressed = (rawSize & 0x80000000) !== 0;
        const size = rawSize & 0x7fffffff;
        if (pos + size > buf.length) throw new Error("truncated lz4 block");
        const block = buf.subarray(pos, pos + size);
        const chunk = uncompressed ? block.slice() : decompressLz4Block(block);
        chunks.push(chunk);
        total += chunk.length;
        pos += size;
        if (flg & 0x10) pos += 4;
    }
    // Single-chunk frames are the common case and need no concatenation pass.
    if (chunks.length === 1) return chunks[0];
    if (chunks.length === 0) return new Uint8Array(0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
    }
    return out;
}


export {
    decompressLz4Block,
    decompressLz4Frame
};
