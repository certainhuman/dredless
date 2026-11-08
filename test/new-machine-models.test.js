import assert from "node:assert/strict";
import test from "node:test";
import {ModelState} from "../src/state/model/state.js";

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
    ...integer(tag), ...integer(entity), ...unsigned(mask), ...values.flatMap(integer), 0
];
function apply(model, generation, ...sections) {
    const result = model.apply(Uint8Array.from([...integer(generation), ...sections.flat(), 0]));
    assert.equal(result.error, null);
    return result;
}

test("new launcher config defaults, deltas and following sections remain aligned", () => {
    const model = new ModelState({isOverworld: false});
    apply(model, 1, section(43, 10, 1, [243]), section(170, 10, 0), section(172, 11, 0));
    let launcher = model.machines().launchers[0];
    assert.equal(launcher.angleDegrees, 0);
    assert.equal(launcher.power, 30);
    assert.equal(model.machines().spawnPoints[0].entity, 11);
    apply(model, 2, section(170, 10, 3, [900, -150]));
    launcher = model.machines().launchers[0];
    assert.equal(launcher.angleDegrees, 90);
    assert.equal(launcher.angleRadians, Math.PI / 2);
    assert.equal(launcher.power, 15);
    apply(model, 3, section(170, 10, 1, [-1800]));
    launcher = model.machines().launchers[0];
    assert.equal(launcher.angleDegrees, 270);
    assert.equal(launcher.angleRadians, -Math.PI / 2);
    assert.equal(launcher.power, 15);
});

test("new rank filters support combinations, disabled, all and unknown rank bits", () => {
    const model = new ModelState({isOverworld: false});
    apply(model, 1, section(43, 10, 1, [220]), section(130, 10, 0), section(171, 10, 0));
    assert.deepEqual(model.machines().doors[0].allowedRanks, ["captain"]);
    apply(model, 2, section(171, 10, 1, [-1]));
    assert.deepEqual(model.machines().doors[0].allowedRanks, ["guest", "crew"]);
    apply(model, 3, section(171, 10, 1, [-3]));
    assert.deepEqual(model.machines().doors[0].allowedRanks, []);
    apply(model, 4, section(171, 10, 1, [0xffffffff]));
    let door = model.machines().doors[0];
    assert.equal(door.rankMask, 0xffffffff);
    assert.equal(door.allRanks, true);
    assert.deepEqual(door.allowedRanks, ["guest", "crew", "captain"]);
    apply(model, 5, section(171, 10, 1, [8 - 0xffffffff]));
    door = model.machines().doors[0];
    assert.equal(door.rankMask, 8);
    assert.equal(door.allRanks, false);
    assert.deepEqual(door.allowedRanks, []);
});

test("spawn marker identifies spawns and rank filter takes precedence over legacy state", () => {
    const model = new ModelState({isOverworld: false});
    apply(model, 1, section(172, 10, 0), section(44, 10, 1, [0]), section(171, 10, 1, [-2]));
    const spawn = model.machines().spawnPoints[0];
    assert.equal(spawn.entity, 10);
    assert.equal(spawn.rankMask, 2);
    assert.deepEqual(spawn.allowedRanks, ["crew"]);
    assert.equal("rank" in spawn, false);
    apply(model, 2, [...integer(57005), ...integer(10), 0]);
    assert.deepEqual(model.machines().spawnPoints, []);
    assert.equal(model.record(80, 10), null);
    assert.equal(model.record(81, 10), null);
});

test("legacy door and spawn restrictions normalize to allowed-rank sets", () => {
    for (const [rank, mask, allowed] of [
        [0, 7, ["guest", "crew", "captain"]], [1, 6, ["crew", "captain"]], [3, 4, ["captain"]]
    ]) {
        const model = new ModelState({isOverworld: false});
        apply(model, 1, section(43, 10, 1, [220]), section(43, 11, 1, [219]),
            section(44, 10, 1, [rank]), section(44, 11, 1, [rank]));
        for (const value of [model.machines().doors[0], model.machines().spawnPoints[0]]) {
            assert.equal(value.rankMask, mask);
            assert.deepEqual(value.allowedRanks, allowed);
            assert.equal("rank" in value, false);
        }
    }
});

test("legacy launcher angle keeps its original scale with unknown power", () => {
    const model = new ModelState({isOverworld: false});
    apply(model, 1, section(43, 10, 1, [243]), section(127, 10, 8, [200]));
    const launcher = model.machines().launchers[0];
    assert.equal(launcher.angleRadians, 1);
    assert.equal(launcher.power, null);
    assert.equal(launcher.configState, null);
});
