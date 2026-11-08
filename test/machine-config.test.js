import assert from "node:assert/strict";
import test from "node:test";
import {DredlessClient} from "../src/client/core.js";
import {decodeMsgpack} from "../src/protocol/codec/msgpack.js";
import {
    buildLauncherConfigData, buildLauncherCopyConfigData, buildLauncherPasteConfigData,
    buildDoorConfigData, buildDoorCopyConfigData, buildDoorPasteConfigData,
    buildSpawnPointConfigData, buildSpawnPointCopyConfigData, buildSpawnPointPasteConfigData,
    normalizeRankMask
} from "../src/protocol/outbound/ui-config.js";

// The November 6 official WASM's config_load_failable accepts these messages and
// reconstructs the listed entity/action and typed configuration values.
const launcher = [138, 20, ...new TextEncoder().encode("config_item_launcher"), 0, 144];
const ranks = [138, 12, ...new TextEncoder().encode("filter_ranks"), 0, 144];
const symmetric = [138, 15, ...new TextEncoder().encode("angle_symmetric"), 0, 144];

test("new config builders match native command shapes, numeric encodings and clipboard classes", () => {
    assert.deepEqual([...buildLauncherConfigData(999, {angle: 123.25, power: 17.5})],
        [144, 0, 129, 231, 3, ...launcher, 136, 0, 128, 246, 66, 136, 0, 0, 140, 65, 145, 145]);
    assert.deepEqual([...buildLauncherConfigData(22, {angle: 360, power: 30})],
        [144, 0, 22, ...launcher, 133, 104, 1, 30, 145, 145]);
    assert.deepEqual([...buildDoorConfigData(22, {allowedRanks: ["crew", "captain"]})],
        [144, 0, 22, ...ranks, 6, 145, 145]);
    assert.deepEqual([...buildDoorCopyConfigData({orientation: "horizontal", allowedRanks: "all"})],
        [144, 1, 10, ...symmetric, 1, 145, ...ranks, 130, 255, 255, 255, 255, 145, 145]);
    assert.deepEqual([...buildSpawnPointPasteConfigData(65536, {allowedRanks: []})],
        [144, 2, 130, 0, 0, 1, 0, ...ranks, 0, 145, 145]);
    assert.deepEqual([...buildSpawnPointCopyConfigData()], [144, 1, 9, ...ranks, 4, 145, 145]);
    assert.deepEqual([...buildLauncherCopyConfigData()], [144, 1, 8, ...launcher, 0, 30, 145, 145]);
    assert.deepEqual([...buildLauncherPasteConfigData(256)], [144, 2, 129, 0, 1, ...launcher, 0, 30, 145, 145]);
    assert.deepEqual([...buildDoorPasteConfigData(256)], [144, 2, 129, 0, 1, ...symmetric, 0, 145, ...ranks, 4, 145, 145]);
});

test("rank writes are explicit sets, including disabled and future-inclusive all", () => {
    assert.equal(normalizeRankMask({allowedRanks: ["guest", "captain"]}), 5);
    assert.equal(normalizeRankMask({allowedRanks: ["crew", "crew"]}), 2);
    assert.equal(normalizeRankMask({allowedRanks: []}), 0);
    assert.equal(normalizeRankMask({allowedRanks: "all"}), 0xffffffff);
    assert.equal(normalizeRankMask({rankMask: 7}), 7);
    for (const config of [{allowedRanks: ["toString"]}, {allowedRanks: ["admin"]},
        {allowedRanks: "crew"}, {rankMask: -1}, {rankMask: 8}, {allowedRanks: [], rankMask: 4}]) {
        assert.throws(() => buildDoorConfigData(1, config));
        assert.throws(() => buildSpawnPointConfigData(1, config));
    }
    assert.throws(() => buildDoorConfigData(1, {orientation: "horizontal"}), /clipboard/);
    assert.throws(() => buildDoorCopyConfigData({orientation: "diagonal"}), /orientation/);
    for (const value of [NaN, Infinity, -1, 360.1, "90", null]) {
        assert.throws(() => buildLauncherConfigData(1, {angle: value}));
    }
    for (const value of [NaN, Infinity, -1, 30.1, "15", null]) {
        assert.throws(() => buildLauncherConfigData(1, {power: value}));
    }
    for (const value of [-1, 1.5, 0x100000000, NaN]) {
        assert.throws(() => buildSpawnPointConfigData(value));
    }
});

function setup(mode = "observe") {
    const messages = [];
    const client = DredlessClient.attachWebSocket({
        readyState: 1, send: bytes => messages.push(decodeMsgpack(bytes)), addEventListener() {}
    }, {mode, ready: true});
    const world = client.worlds.get(1);
    client.worlds.currentWorldId = 1;
    world.isOverworld = false;
    world.model.setWorldKind(false);
    world.model.tables.set(7, new Map([[300, {q20: 243}], [301, {q20: 220}], [302, {q20: 219}]]));
    world.model.tables.set(79, new Map([[300, {q20: 900, q24: 175}]]));
    world.model.tables.set(80, new Map([[301, {q20: 5}], [302, {q20: 0}]]));
    world.model.tables.set(81, new Map([[302, {}]]));
    world.model.tables.set(0, new Map([[301, {q28: 200}]]));
    return {client, messages};
}

test("handles send entity-targeted configs, merge observed values and copy placement orientation", () => {
    const {client, messages} = setup();
    const machines = client.currentShip().machines;
    const itemLauncher = machines.launcher(300);
    assert.equal(itemLauncher.setAngle(45), client);
    assert.deepEqual(messages.pop(), {type: 8, data: buildLauncherConfigData(300, {angle: 45, power: 17.5})});
    itemLauncher.setPower(12.5);
    assert.deepEqual(messages.pop(), {type: 8, data: buildLauncherConfigData(300, {angle: 90, power: 12.5})});
    itemLauncher.copy();
    assert.deepEqual(messages.pop(), {type: 8, data: buildLauncherCopyConfigData({angle: 90, power: 17.5})});
    itemLauncher.paste({power: 0});
    assert.deepEqual(messages.pop(), {type: 8, data: buildLauncherPasteConfigData(300, {angle: 90, power: 0})});
    itemLauncher.configure({angle: 10, power: 20});
    assert.deepEqual(messages.pop(), {type: 8, data: buildLauncherConfigData(300, {angle: 10, power: 20})});
    const door = machines.door(301);
    door.setAllowedRanks(["guest", "crew"]);
    assert.deepEqual(messages.pop(), {type: 8, data: buildDoorConfigData(301, {rankMask: 3})});
    door.copy();
    assert.deepEqual(messages.pop(), {type: 8, data: buildDoorCopyConfigData({rankMask: 5, orientation: "horizontal"})});
    door.paste({allowedRanks: "all"});
    assert.deepEqual(messages.pop(), {type: 8, data: buildDoorPasteConfigData(301, {allowedRanks: "all", orientation: "horizontal"})});
    door.setRankMask(4);
    assert.deepEqual(messages.pop(), {type: 8, data: buildDoorConfigData(301, {rankMask: 4})});
    const spawn = machines.spawnPoint(302);
    spawn.configure();
    assert.deepEqual(messages.pop(), {type: 8, data: buildSpawnPointConfigData(302, {rankMask: 0})});
    spawn.copy();
    assert.deepEqual(messages.pop(), {type: 8, data: buildSpawnPointCopyConfigData({rankMask: 0})});
    spawn.paste({allowedRanks: ["captain"]});
    assert.deepEqual(messages.pop(), {type: 8, data: buildSpawnPointPasteConfigData(302, {rankMask: 4})});
    assert.throws(() => itemLauncher.setPower(null), /power/);
    assert.throws(() => door.configure({orientation: "horizontal"}), /clipboard/);
    assert.equal(messages.length, 0);
});

test("new configuration uses the existing readonly guard", () => {
    const {client, messages} = setup("readonly");
    assert.throws(() => client.currentShip().machines.door(301).configure({allowedRanks: []}), /readonly/i);
    assert.equal(messages.length, 0);
});
