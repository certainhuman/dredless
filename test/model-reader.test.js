import assert from "node:assert/strict";
import test from "node:test";
import {ModelReader} from "../src/state/model/reader.js";

// Reference preserves the original floating-point arithmetic for large varints.
function reference(bytes) {
    let value = 0;
    for (let i = 0; i < bytes.length; i++) value += (bytes[i] & 127) * (2 ** (7 * i));
    return value;
}

test("model varints preserve values and cursor across all supported widths", () => {
    for (let width = 1; width <= 11; width++) {
        for (const payload of [0, 1, 63, 127]) {
            const bytes = Uint8Array.from({length: width}, (_, i) => payload | (i < width - 1 ? 128 : 0));
            const reader = new ModelReader(bytes);
            assert.equal(reader.readUnsigned(), reference(bytes));
            assert.equal(reader.remaining, 0);
        }
    }
    const reader = new ModelReader(Uint8Array.of(0, 127, 128, 1, 255, 127));
    assert.deepEqual(Array.from({length: 4}, () => reader.readUnsigned()), [0, 127, 128, 16383]);
});

test("model varints reject truncation and excessive continuation", () => {
    for (const bytes of [[], [128], [255, 128]]) {
        assert.throws(() => new ModelReader(Uint8Array.from(bytes)).readUnsigned(), /read past end/);
    }
    assert.throws(() => new ModelReader(new Uint8Array(11).fill(128)).readUnsigned(), /varint too large/);
});
