import assert from "node:assert/strict";
import test from "node:test";
import {ModelState} from "../src/state/model/index.js";

function unsigned(value) {
    const bytes = [];
    do {
        const byte = value % 128;
        value = Math.floor(value / 128);
        bytes.push(byte | (value ? 128 : 0));
    } while (value);
    return bytes;
}

function streamInt(value) {
    return unsigned(value < 0 ? -2 * value + 1 : 2 * value);
}

function fieldDelta(value) {
    return unsigned(value < 0 ? -2 * value + 1 : 2 * value);
}

function section(tag, rows) {
    let previous = 0;
    const bytes = streamInt(tag);
    for (const [entity, mask, payload] of rows) {
        bytes.push(...streamInt(entity - previous), ...unsigned(mask), ...payload);
        previous = entity;
    }
    return [...bytes, 0];
}

function packet(generation, ...sections) {
    return Uint8Array.from([...streamInt(generation), ...sections.flat(), 0]);
}

// Official loader wire layout: mask, packed absolute flags (if present), then
// signed numeric deltas in pick/place/priority/stack/cycle order.
function loaderPayload(mask, deltas, requireOutput = false, waitForStack = false) {
    const bytes = [];
    if (mask & 96) {
        let packed = 0;
        let bit = 0;
        if (mask & 32) packed |= Number(requireOutput) << bit++;
        if (mask & 64) packed |= Number(waitForStack) << bit;
        bytes.push(...unsigned(packed));
    }
    for (let i = 0; i < 5; i++) {
        if (mask & (1 << i)) bytes.push(...fieldDelta(deltas[i]));
    }
    return bytes;
}

function loaderTypes(...entities) {
    return section(43, entities.map(entity => [entity, 1, fieldDelta(252)]));
}

function config(model, entity) {
    const {pick, place, priority, stack, cycle, requireOutput, waitForStack} = model.entity(entity).contents.loader;
    return {pick, place, priority, stack, cycle, requireOutput, waitForStack};
}

test("loaders use official defaults when their config is omitted or sparse", () => {
    const model = new ModelState();
    model.apply(packet(1, loaderTypes(21, 40), section(162, [[40, 16, fieldDelta(100)]])));
    assert.deepEqual(model.errors, []);
    const defaults = {pick: 3, place: 4, priority: 0, stack: 16, cycle: 1, requireOutput: false, waitForStack: false};
    assert.deepEqual(config(model, 21), defaults);
    assert.deepEqual(config(model, 40), {...defaults, cycle: 6});
});

test("loader flags are absolute values and repeated updates preserve numeric settings", () => {
    const model = new ModelState();
    model.apply(packet(1, loaderTypes(21), section(162, [[21, 31, loaderPayload(31, [2, -2, 1, -8, 100])]])));
    const numeric = {pick: 5, place: 2, priority: 1, stack: 8, cycle: 6};
    let generation = 1;
    for (const [mask, requireOutput, waitForStack] of [
        [32, true, false], [32, true, false], [64, true, true], [64, true, true],
        [32, false, true], [32, false, true], [96, false, false], [96, true, false],
        [96, false, true], [96, true, true], [96, true, true], [96, false, false]
    ]) {
        model.apply(packet(++generation, section(162, [[21, mask, loaderPayload(mask, [], requireOutput, waitForStack)]])));
        assert.deepEqual(model.errors, []);
        assert.deepEqual(config(model, 21), {...numeric, requireOutput, waitForStack});
    }
});

test("loader packed flags stay aligned with numeric deltas for every mask", () => {
    for (let mask = 0; mask < 128; mask++) {
        for (let flags = 0; flags < 4; flags++) {
            const model = new ModelState();
            model.apply(packet(1, loaderTypes(21), section(162, [
                [21, 127, loaderPayload(127, [1, -2, 1, -9, 80], true, true)]
            ])));
            const requireOutput = Boolean(flags & 1);
            const waitForStack = Boolean(flags & 2);
            model.apply(packet(2,
                section(162, [[21, mask, loaderPayload(mask, [2, 1, -1, 5, 40], requireOutput, waitForStack)]]),
                // A following section detects accidental reads beyond the loader row.
                section(42, [[21, 3, [...fieldDelta(150), ...fieldDelta(3)]]])
            ));
            assert.deepEqual(model.errors, [], `mask=${mask}, flags=${flags}`);
            assert.deepEqual(config(model, 21), {
                pick: mask & 1 ? 6 : 4,
                place: mask & 2 ? 3 : 2,
                priority: mask & 4 ? 0 : 1,
                stack: mask & 8 ? 12 : 7,
                cycle: mask & 16 ? 7 : 5,
                requireOutput: mask & 32 ? requireOutput : true,
                waitForStack: mask & 64 ? waitForStack : true
            }, `mask=${mask}, flags=${flags}`);
            assert.equal(model.entity(21).contents.loader.heldItemId, 150);
            assert.equal(model.entity(21).contents.loader.heldCount, 3);
        }
    }
});

test("loader rows preserve wire entity IDs across unsorted and repeated full-snapshot rows", () => {
    const model = new ModelState();
    const update = model.apply(packet(1,
        loaderTypes(10, 40),
        section(162, [
            [40, 1, fieldDelta(2)],
            [10, 2, fieldDelta(-2)],
            [40, 1, fieldDelta(-1)]
        ])
    ), {full: true});
    assert.deepEqual(model.errors, []);
    assert.deepEqual(update.sections[1].records.map(row => row.entity), [40, 10, 40]);
    assert.equal(config(model, 10).pick, 3);
    assert.equal(config(model, 10).place, 2);
    assert.equal(config(model, 40).pick, 4);
    assert.equal(config(model, 40).place, 4);
    assert.deepEqual([...model.table(69).keys()], [40, 10]);
});
