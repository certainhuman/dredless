import assert from "node:assert/strict";
import test from "node:test";
import {ModelState} from "../src/state/model/state.js";
import {botClassFromState, summarizeHealth} from "../src/state/model/decoder.js";

function integer(value) {
    let n = Math.abs(value) * 2 + (value < 0 ? 1 : 0);
    const bytes = [];
    do { bytes.push((n % 128) | (n >= 128 ? 128 : 0)); n = Math.floor(n / 128); } while (n);
    return bytes;
}
function applyHealth(model, mask, values, generation = 1) {
    // Plain model stream: generation, health tag, entity delta, mask, field deltas.
    const update = model.apply(Uint8Array.from([
        ...integer(generation), ...integer(40), ...integer(1), mask,
        ...values.flatMap(integer), 0, 0
    ]));
    assert.equal(update.error, null);
    return model.record(5, 1);
}

test("health bar dimensions start at one world unit when not transmitted", () => {
    for (const [mask, values] of [[0, []], [3, [1000, 500]]]) {
        const record = applyHealth(new ModelState(), mask, values);
        assert.equal(record.q28, 10);
        assert.equal(record.q32, 10);
    }
});

test("health dimension deltas accumulate from defaults only once", () => {
    const model = new ModelState();
    let record = applyHealth(model, 15, [1000, 500, 20, 33]);
    assert.equal(record.q28, 30);
    assert.equal(record.q32, 43);
    record = applyHealth(model, 12, [-5, -13], 2);
    assert.equal(record.q28, 25);
    assert.equal(record.q32, 30);
    record = applyHealth(model, 2, [-25], 3);
    assert.equal(record.q24, 475);
    assert.equal(record.q28, 25);
    assert.equal(record.q32, 30);
});

test("signed health offsets can cross zero", () => {
    const record = applyHealth(new ModelState(), 15, [1000, 500, -5, -15]);
    assert.equal(record.q28, 5);
    assert.equal(record.q32, -5);
});

test("bot fingerprints use health dimensions including their wire defaults", () => {
    const cases = [
        ["the-coward", 70, 78, 1000, {}],
        ["zombie-boss", 30, 166, 1000, {table2Record: {q20: 320, q24: -900}, combatRecord: {q20: -430233088}}],
        ["red-sentry", 70, 166, 1000, {table2Record: {q20: 320, q24: -900}}],
        ["blue-rusher", 30, 34, 1000, {table2Record: {q20: 80, q24: -900}}],
        ["red-sniper", 35, 89, 1000, {table2Record: {q20: 180, q24: -900}}],
        ["yellow-hunter", 30, 56, 1000, {table2Record: {q20: 120, q24: -900}}],
        ["aqua-shielder", 50, 122, 1000, {table2Record: {q20: 240, q24: -900}}],
        ["lazer-enthusiast", 140, 155, 1000, {table2Record: {q20: 300, q24: -900}, table10Record: {}, beamRecord: {}}],
        ["yellow-mine-guard", 30, 33, 1000, {smallRecord: {q20: 78, q24: 78}, combatRecord: {q24: -995542016}}],
        ["shield-helper", 30, 33, 1000, {}],
        ["shield-master", 190, 210, 15000, {table2Record: {}}]
    ];
    for (const [expected, widthDelta, offsetDelta, maxHp, state] of cases) {
        const record = applyHealth(new ModelState(), 15, [maxHp, 500, widthDelta, offsetDelta]);
        assert.equal(botClassFromState({...state, health: summarizeHealth(1, record)}), expected);
    }
});
