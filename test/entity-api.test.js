import assert from "node:assert/strict";
import test from "node:test";

import {DredlessClient} from "../src/client.js";
import {Connection} from "../src/game/connection.js";

const encoder = new TextEncoder();

function createClientWithPusher() {
    const session = {
        baseUrl: "https://drednot.io",
        cookies: new Map(),
        toJSON() {
            return {test: true};
        }
    };
    const client = new DredlessClient(new Connection(session, "token", 1, 0, {domain: "localhost"}), {connect: false});
    const world = client.worlds.get(1);
    client.worlds.currentWorldId = 1;
    client.sid = 99;
    client.captainSubrank = {subrank: 2, enableCheats: true};
    world.isOverworld = false;
    world.model.setWorldKind(false);
    world.model.tables.set(0, new Map([[27, {q20: 1400, q24: 260, q28: 0}]]));
    world.model.tables.set(72, new Map([[27, {q20: -2, q24: 1, q28: 900, q32: 300, q40: 0}]]));
    world.model.tables.set(5, new Map([[27, {q20: 100, q24: 75}]]));
    world.model.tables.set(77, new Map([[27, {q20: 100, q24: null, q28: 103}]]));
    world.model.tables.set(42, new Map([[27, {q20: 240, q24: 1}]]));
    world.model.tables.set(3, new Map([[27, {q20: 10, q24: 10}]]));
    world.model.tables.set(7, new Map([
        [30, {q20: 215}],
        [31, {q20: 240}],
        [32, {q20: 217}],
        [33, {q20: 220}],
        [34, {q20: 257}],
        [35, {q20: 230}]
    ]));
    world.model.tables.set(6, new Map([[31, {q20: 150, q24: 16}]]));
    world.model.tables.set(51, new Map([[31, {q20: 25, q24: 30}]]));
    world.model.tables.set(39, new Map([[32, {q20: 4}]]));
    world.model.tables.set(8, new Map([[33, {q20: 2}]]));
    world.model.tables.set(47, new Map([[33, {q21: 1}]]));
    world.model.tables.set(62, new Map([[34, {q21: 1}]]));
    world.model.tables.set(50, new Map([[35, {q20: 2, q24: 63}]]));
    world.model.tables.set(55, new Map([[99, {q28: 109, q72: 3, q76: 0, blob92: encoder.encode("Captain Test")}]]));
    return client;
}

test("entity API exposes frozen snapshots, features, and typed domain handles", () => {
    const client = createClientWithPusher();
    const ship = client.currentShip();
    const [snapshot] = ship.entities.snapshots();

    assert.equal(snapshot.id, 27);
    assert.equal(snapshot.entity, 27);
    assert.equal(snapshot.position.x, 35);
    assert.equal(snapshot.type, "pusher");
    assert.equal(snapshot.is("placed_entity"), true);
    assert.equal(snapshot.is("machine"), true);
    assert.equal(snapshot.is("pusher"), true);
    assert.equal(snapshot.has("filter"), true);
    assert.equal(snapshot.feature("filterMode"), 1);
    assert.equal(snapshot.feature("filterInventory"), false);
    assert.equal(snapshot.feature("beam").length, 24);
    assert.equal(snapshot.feature("outline").width, 1);
    assert.deepEqual(snapshot.feature("filterSlots"), [100, null, 103]);
    assert.deepEqual(snapshot.features.filter((feature) => [
        "health",
        "position",
        "outline",
        "filter",
        "filterMode",
        "filterSlots",
        "filterInventory",
        "beam",
        "pusherConfig"
    ].includes(feature)), [
        "health",
        "position",
        "outline",
        "filter",
        "filterMode",
        "filterSlots",
        "filterInventory",
        "beam",
        "pusherConfig"
    ]);
    assert.equal(Object.hasOwn(snapshot, "contents"), false);
    assert.equal(snapshot.contents, undefined);
    assert.equal(Object.isFrozen(snapshot), true);

    const entity = ship.entities.get(snapshot);
    assert.equal(entity.id, 27);
    assert.equal(entity.type, "pusher");
    assert.equal(entity.is("pusher"), true);
    assert.equal(entity.has("filterSlots"), true);
    assert.deepEqual(entity.feature("filterSlots"), [100, null, 103]);
    assert.equal("contents" in entity, false);
    assert.equal(entity.contents, undefined);

    const pusher = entity.as("pusher");
    assert.ok(pusher);
    assert.equal(pusher.id, 27);
    assert.equal(pusher.state.mode, 0);
    assert.equal(pusher.mode, 0);
    assert.equal(entity.as("loader"), null);

    const raw = client.debug.entity("ship", 27);
    assert.ok(raw.contents.pusher);
    assert.equal(client.debug.entities("ship")[0].contents.pusher.entity, 27);

    const machines = ship.machines.state();
    assert.equal(machines.pushers.length, 1);
    assert.equal(machines.pusherBeams.length, 1);
    assert.equal(machines.helms.length, 1);
    assert.equal(machines.expandoBoxes.length, 1);
    assert.equal(machines.commsStations.length, 1);
    assert.equal(machines.doors.length, 1);
    assert.equal(machines.shieldProjectors.length, 1);
    assert.equal(machines.thrusters.length, 1);

    assert.equal(ship.machines.helms()[0].state.typeId, 215);
    assert.equal(ship.entities.get(30).asHelm().occupied, false);
    assert.equal(ship.entities.get(31).as("expando").state.count, 16);
    assert.equal(ship.entities.get(32).asCommsStation().state.charges, 4);
    assert.equal(ship.entities.get(32).feature("occupied"), false);
    assert.equal(ship.entities.get(33).asDoor().open, true);
    assert.equal(ship.entities.get(34).asShieldProjector().active, true);
    assert.equal(ship.entities.get(35).asThruster().state.fuel, 63);

    assert.equal(client.currentPlayerEntity().id, 99);
    assert.equal(ship.players.current().name, "Captain Test");
    assert.equal(client.player.entity().id, 99);
    assert.equal(client.player.name(), "Captain Test");
    assert.deepEqual(client.player.rank(), {
        shipRank: "captain",
        subrank: 2,
        isCaptain: true,
        patronTier: null
    });
    assert.equal(ship.players.current().isDeveloper, false);
    assert.equal(ship.players.current().isPatron, false);
    assert.equal(client.management.hasCheats(), true);
});
