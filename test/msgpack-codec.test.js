import assert from "node:assert/strict";
import test from "node:test";
import {decodeMsgpack, encodeMsgpack} from "../src/protocol/codec/msgpack.js";

test("msgpack map keys decode correctly through the key cache", () => {
    const longKey = "k".repeat(40);
    const value = {type: 20, world: 3, tick: 1, tock: 2, [longKey]: true, 7: "numeric", nested: {type: "inner", world: null}};
    const bytes = encodeMsgpack(value);
    const expected = {...value};
    assert.deepEqual(decodeMsgpack(bytes), expected);
    assert.deepEqual(decodeMsgpack(bytes), expected);

    // Cached keys must not alias the buffer they were first read from.
    const scratch = bytes.slice();
    assert.deepEqual(decodeMsgpack(scratch), expected);
    scratch.fill(0xc0);
    assert.deepEqual(decodeMsgpack(bytes), expected);
    assert.deepEqual(Object.keys(decodeMsgpack(encodeMsgpack({tick: 1, tock: 2, tack: 3}))), ["tick", "tock", "tack"]);
    assert.deepEqual(decodeMsgpack(encodeMsgpack({"": 1, "é": 2})), {"": 1, "é": 2});
});
