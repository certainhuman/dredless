import assert from "node:assert/strict";
import test from "node:test";
import {DredlessClient} from "../src/client/index.js";
import {decodeMsgpack} from "../src/protocol/codec/msgpack.js";
import {buildGeneratorMazePuzzleData, buildLoaderConfigData, buildNavigationUnitPasteConfigData, buildNavigationUnitConfigData} from "../src/protocol/outbound/ui-config.js";
import {ModelState} from "../src/state/model/state.js";
import {summarizeItemCrate} from "../src/state/model/decoder.js";

// Explicit protocol boundary cases, independent of the encoder under test.
const targets = [[0, [0]], [63, [63]], [64, [128, 64]], [255, [128, 255]],
    [256, [129, 0, 1]], [300, [129, 44, 1]], [65535, [129, 255, 255]], [65536, [130, 0, 0, 1, 0]], [0xffffffff, [130, 255, 255, 255, 255]]];
test("generator and loader commands use compact little-endian entity IDs", () => {
    for (const [id, bytes] of targets) {
        for (const [action, build] of [[0, n => buildGeneratorMazePuzzleData(n, "123")],
            [0, n => buildLoaderConfigData(n)], [2, n => buildNavigationUnitPasteConfigData(n, {destination: 10})]]) {
            const message = build(id);
            assert.deepEqual([...message.subarray(0, 2 + bytes.length)], [144, action, ...bytes]);
            assert.equal(message[2 + bytes.length], 138, "string section follows the target");
        }
    }
    for (const id of [-1, 0x100000000, 1.5, NaN, Infinity]) {
        assert.throws(() => buildLoaderConfigData(id), /unsigned 32-bit/);
    }
});

test("crate dimensions use world units and retain the raw size", () => {
    const crate = summarizeItemCrate(7, {q20: 160, q24: 80});
    assert.equal(crate.width, 16);
    assert.equal(crate.height, 8);
    assert.equal(crate.rawWidth, 160);
    assert.equal(crate.rawHeight, 80);
    assert.deepEqual(crate.sizeState, {q20: 160, q24: 80});
    assert.equal(summarizeItemCrate(7, {}).width, null);
});

test("starting warp preserves the observed navigation destination and auto-warp flags", () => {
    const messages = [];
    const client = DredlessClient.attachWebSocket({readyState: 1,
        send: bytes => messages.push(decodeMsgpack(bytes)), addEventListener() {}
    }, {mode: "observe", ready: true});
    const world = client.worlds.get(1);
    client.worlds.currentWorldId = 1;
    world.model.tables.set(7, new Map([[300, {q20: 261}]]));
    world.model.tables.set(78, new Map([[300, {q20: 9, q32: 1, q36: 1}]]));
    const observed = world.model.entity(300).contents.navigationUnit;
    client.startWarp(300);
    assert.deepEqual(messages.pop(), {type: 8, data: buildNavigationUnitConfigData(300, {
        destination: observed.destination, page: 1, warp: "start",
        autoWarpOnShieldFailure: observed.autoWarpOnShieldFailure,
        autoWarpOnNoCaptains: observed.autoWarpOnNoCaptains
    })});
});

function unsigned(value) {
    const bytes = [];
    do {
        bytes.push(value % 128 | (value >= 128 ? 128 : 0));
        value = Math.floor(value / 128);
    } while (value);
    return bytes;
}
const integer = value => unsigned(Math.abs(value) * 2 + (value < 0 ? 1 : 0));
const section = (tag, entity, mask, values = []) => [
    ...integer(tag), ...integer(entity), ...unsigned(mask), ...values.flat(), 0
];
function apply(model, generation, ...sections) {
    const result = model.apply(Uint8Array.from([...integer(generation), ...sections.flat(), 0]));
    assert.equal(result.error, null);
}

test("wire 173/174 preserve native defaults, packed order and delta values", () => {
    const model = new ModelState();
    apply(model, 1, section(173, 10, 0), section(174, 11, 0));
    assert.deepEqual(model.record(82, 10), {q20: 20, q24: 100, q28: 20, q32: 100,
        q36: 0, q37: 0, q38: 0, q39: 0, lastMask: 0});
    assert.deepEqual(model.record(83, 11), {q20: 0xdddddd, q24: 0x404040, q28: 100, q32: 0, lastMask: 0});
    apply(model, 2,
        section(173, 10, 127, [unsigned(5), integer(-5), integer(2), integer(3), integer(-4)]),
        section(174, 11, 7, [integer(-0xdddddd), integer(1), integer(-50)]),
        section(1, 12, 1, [integer(40)]));
    assert.deepEqual(model.record(82, 10), {q20: 15, q24: 102, q28: 23, q32: 96,
        q36: 0, q37: 1, q38: 0, q39: 1, lastMask: 127});
    assert.equal(model.record(83, 11).q20, 0);
    assert.equal(model.record(83, 11).q24, 0x404041);
    assert.equal(model.record(83, 11).q28, 50);
    assert.equal(model.record(0, 12).q20, 40, "following section remains aligned");
    apply(model, 3, section(173, 10, 32, [unsigned(1)]));
    assert.equal(model.record(82, 10).q37, 1);
    assert.equal(model.record(82, 10).q38, 1, "sparse packed values start at bit zero");
    assert.equal(model.record(82, 10).q39, 1);
});

test("docking springs require the official spring marker rather than wall geometry", () => {
    const model = new ModelState({isOverworld: true});
    apply(model, 1,
        section(2, 10, 8, [integer(-1)]),
        section(4, 10, 3, [integer(160), integer(160)]),
        section(89, 10, 1, [integer(1)]),
        section(4, 11, 3, [integer(320), integer(20)]),
        section(85, 11, 0));
    assert.equal(model.entity(10).contents?.dockingSpring, undefined, "decorative wall is excluded");
    const spring = model.entity(11).contents.dockingSpring;
    assert.equal(spring.width, 32);
    assert.equal(spring.height, 2);
});
