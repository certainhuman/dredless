import {toUint8Array} from "../../protocol/codec/binary.js";

export class ModelReader {
    constructor(bytes) {
        this.bytes = toUint8Array(bytes);
        this.offset = 0;
    }

    get remaining() {
        return this.bytes.length - this.offset;
    }

    readByte() {
        if (this.offset >= this.bytes.length) throw new Error("model_data read past end");
        return this.bytes[this.offset++];
    }

    readUnsigned() {
        let result = 0;
        let shift = 0;
        while (true) {
            const byte = this.readByte();
            result += (byte & 0x7f) * (2 ** shift);
            if ((byte & 0x80) === 0) return result;
            shift += 7;
            if (shift > 70) throw new Error("model_data varint too large");
        }
    }

    readStreamInt() {
        const raw = this.readUnsigned();
        return (raw & 1) === 0 ? raw / 2 : -((raw + 1) / 2);
    }

    readFieldDelta() {
        const raw = this.readUnsigned();
        return (raw & 1) === 0 ? raw / 2 : -(raw >> 1);
    }

    readBlob() {
        const length = this.readStreamInt();
        if (length < 0) throw new Error(`negative blob length ${length}`);
        const end = this.offset + length;
        if (end > this.bytes.length) throw new Error("model_data blob read past end");
        const blob = this.bytes.slice(this.offset, end);
        this.offset = end;
        return blob;
    }

    // Called once per section while scanning, so a fresh tail scan each time is
    // O(bytes x sections). The index of the last non-zero byte is fixed for the
    // packet, so compute it once and compare offsets thereafter.
    trailingZeroOnly() {
        if (this._lastNonZero === undefined) {
            let last = -1;
            for (let i = this.bytes.length - 1; i >= 0; i--) {
                if (this.bytes[i] !== 0) {
                    last = i;
                    break;
                }
            }
            this._lastNonZero = last;
        }
        return this.offset > this._lastNonZero;
    }
}

// `key` is precomputed: it is fixed per field but was rebuilt as a template

