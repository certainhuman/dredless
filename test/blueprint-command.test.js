import assert from "node:assert/strict";
import test from "node:test";

import {buildBlueprintPlacementMessage} from "../src/protocol/outbound/blueprint.js";
import {encodeMsgpack} from "../src/protocol/codec/msgpack.js";

function hex(value) {
    return Buffer.from(value).toString("hex");
}

test("buildBlueprintPlacementMessage matches official client placement captures", () => {
    const hyperRubber = buildBlueprintPlacementMessage({
        x: 28,
        y: 18,
        width: 3,
        height: 3,
        source: "DSA:m8DAzDxhAgMDU8NL9olAmhFKM4DoiRMB"
    });
    assert.deepEqual(hyperRubber, {
        type: 9,
        x: 28,
        y: 18,
        w: 3,
        h: 3,
        source: "DSA:m8DAzDxhAgMDU8NL9olAmhFKM4DoiRMB"
    });

    const iron = buildBlueprintPlacementMessage({
        x: 29,
        y: 17,
        w: 3,
        h: 2,
        source: "DSA:m8DAzDRhAgMDY8ML5olAmgFET5wIAA=="
    });
    assert.deepEqual(iron, {
        type: 9,
        x: 29,
        y: 17,
        w: 3,
        h: 2,
        source: "DSA:m8DAzDRhAgMDY8ML5olAmgFET5wIAA=="
    });

    assert.equal(
        hex(encodeMsgpack(hyperRubber)),
        "86a47479706509a1781ca17912a17703a16803a6736f75726365d9244453413a6d3844417a44786841674d4455384e4c396f6c416d68464b4d34446f69524d42",
        "place-blueprint-3x3-hyper-rubber-block.jsonl"
    );
    assert.equal(
        hex(encodeMsgpack(iron)),
        "86a47479706509a1781da17911a17703a16802a6736f75726365d9244453413a6d3844417a44526841674d4459384d4c356f6c416d6746455435774941413d3d",
        "place-blueprint-2x2-iron-block.jsonl"
    );
});

test("buildBlueprintPlacementMessage rejects malformed placements", () => {
    assert.throws(() => buildBlueprintPlacementMessage({x: 0, y: 0, width: 1, height: 1}), /source/);
    assert.throws(() => buildBlueprintPlacementMessage({x: 0, y: 0, width: 0, height: 1, source: "DSA:x"}), /width/);
    assert.throws(() => buildBlueprintPlacementMessage({x: 0, y: Infinity, width: 1, height: 1, source: "DSA:x"}), /y/);
});
