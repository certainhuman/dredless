import assert from "node:assert/strict";
import test from "node:test";
import {DredlessClient} from "../src/client/index.js";
import {DisconnectError, DropReason, normalizeDisconnect} from "../src/network/disconnect.js";
import {decodeMsgpack, encodeMsgpack} from "../src/protocol/codec/msgpack.js";

function setup({ready = true, style = "browser", onClose = null} = {}) {
    const listeners = new Map();
    const sent = [];
    const ws = {readyState: 1, send: bytes => sent.push(decodeMsgpack(bytes))};
    if (onClose) ws.onclose = onClose;
    const subscribe = (type, callback) => listeners.set(type, callback);
    if (style === "browser") ws.addEventListener = subscribe;
    else if (style === "emitter") ws.on = subscribe;
    const client = DredlessClient.attachWebSocket(ws, {ready, sid: ready ? 123 : null});
    const dispatch = (type, ...args) => (listeners.get(type) ?? ws[`on${type}`])(...args);
    client.worlds.currentWorldId = 10;
    client.worlds.get(10).readMeta({is_overworld: false, parent_world: 0});
    client.worlds.get(0).readMeta({is_overworld: true, danger_level: 0});
    return {client, ws, sent, dispatch};
}

function closeEvent(code = DropReason.Saved) {
    return {code, reason: "server reason", wasClean: true};
}

test("disconnect reasons normalize browser events, Node buffers, and unknown codes", () => {
    assert.equal(DropReason.ProtocolError, 4000);
    assert.equal(DropReason.Saved, 4015);
    assert.equal(DropReason.GTFO, 4019);
    assert.equal(Object.keys(DropReason).length, 20);
    assert.equal(Object.isFrozen(DropReason), true);
    assert.deepEqual(normalizeDisconnect(closeEvent()), {
        code: 4015, name: "Saved", reason: "server reason", wasClean: true
    });
    assert.deepEqual(normalizeDisconnect(4009, Buffer.from("banned — reason")), {
        code: 4009, name: "Banned", reason: "banned — reason", wasClean: null
    });
    assert.deepEqual(normalizeDisconnect({code: 1006, reason: "network", wasClean: false}), {
        code: 1006, name: null, reason: "network", wasClean: false
    });
    assert.deepEqual(normalizeDisconnect(4500), {code: 4500, name: null, reason: "", wasClean: null});
    assert.equal(normalizeDisconnect().code, 1006);
    assert.equal(Object.isFrozen(normalizeDisconnect(4015)), true);
});

test("closing cleans up session state and preserves the raw browser close event", () => {
    const {client, dispatch} = setup();
    client.shipConfig = {privacy: 0};
    client.captainSubrank = {subrank: 1};
    client.playerList = {players: []};
    client.puiPanels.set(1, {});
    client.commsPanels.set(1, {});
    client.currentCommsPanel = {};
    client.commandAcks.set(10, 1);
    client.lastCommandAck = {world: 10, commandNumber: 1};
    let raw;
    let info;
    client.on("close", event => { raw = event; });
    client.on("disconnect", event => {
        info = event;
        assert.equal(client.connected, false);
        assert.equal(client.ready, false);
        assert.equal(client.sid, null);
    });
    const event = closeEvent();
    dispatch("close", event);
    assert.equal(raw, event);
    assert.equal(client.lastDisconnect, info);
    assert.equal(client.net.lastDisconnect, info);
    assert.equal(client.state().lastDisconnect, info);
    assert.equal(client.shipConfig, null);
    assert.equal(client.captainSubrank, null);
    assert.equal(client.playerList, null);
    assert.equal(client.currentCommsPanel, null);
    assert.equal(client.puiPanels.size, 0);
    assert.equal(client.commsPanels.size, 0);
    assert.equal(client.commandAcks.size, 0);
    assert.equal(client.lastCommandAck, null);
    assert.equal(client.management.canSave(), false);
    assert.throws(() => client.sendMessage({type: 2}), DisconnectError);
    assert.throws(() => client.send({x: 1}), DisconnectError);
});

test("EventEmitter sockets normalize close code and reason without changing raw arguments", () => {
    const {client, dispatch} = setup({style: "emitter"});
    let raw;
    client.on("close", (...args) => { raw = args; });
    const reason = Buffer.from("kicked");
    dispatch("close", DropReason.Kicked, reason);
    assert.deepEqual(raw, [DropReason.Kicked, reason]);
    assert.deepEqual(client.lastDisconnect, {code: 4008, name: "Kicked", reason: "kicked", wasClean: null});
});

test("property-only sockets preserve existing close callbacks and emit normalized disconnects", () => {
    let previousEvent;
    const {client, ws} = setup({style: "properties", onClose: event => { previousEvent = event; }});
    const event = closeEvent(DropReason.Shutdown);
    ws.onclose(event);
    assert.equal(previousEvent, event);
    assert.equal(client.lastDisconnect.name, "Shutdown");
    assert.equal(client.ready, false);
});

test("closing before readiness rejects whenReady and discards pending writes", async () => {
    const {client, dispatch, sent} = setup({ready: false});
    const waiting = assert.rejects(client.whenReady(), error => {
        assert.ok(error instanceof DisconnectError);
        assert.equal(error.disconnect.code, DropReason.Banned);
        return true;
    });
    client.send({x: 1});
    client.sendMessage({type: 2, msg: "queued"});
    dispatch("message", {data: new Blob([encodeMsgpack({type: 21, sid: 321, world: 10})])});
    dispatch("close", closeEvent(DropReason.Banned));
    await waiting;
    assert.deepEqual(sent, []);
    // A socket close can race with asynchronous Blob decoding. A late ready
    // packet must not restore readiness or send stale queued commands.
    dispatch("message", {data: encodeMsgpack({type: 21, sid: 321, world: 10})});
    assert.equal(client.ready, false);
    assert.deepEqual(sent, []);
});

test("save subscribes before sending and resolves on a synchronous Saved disconnect", async () => {
    const {client, ws, dispatch} = setup();
    ws.send = bytes => {
        assert.deepEqual(decodeMsgpack(bytes), {type: 4, act: "save_team", arg: null});
        dispatch("close", closeEvent());
    };
    const result = await client.management.save();
    assert.equal(result.code, DropReason.Saved);
    assert.equal(result, client.lastDisconnect);
    assert.equal(client.ready, false);
    assert.equal(client.connected, false);
});

test("save rejects other disconnect reasons with their normalized details", async () => {
    for (const code of [DropReason.Kicked, DropReason.Banned, DropReason.Shutdown, 1006]) {
        const {client, dispatch} = setup();
        const saving = client.management.save({timeout: 100});
        const rejected = assert.rejects(saving, error => {
            assert.ok(error instanceof DisconnectError);
            assert.equal(error.disconnect.code, code);
            assert.equal(error.disconnect, client.lastDisconnect);
            return true;
        });
        dispatch("close", closeEvent(code));
        await rejected;
    }
});

test("save rejects overlap, timeout, invalid timeout, and send failure while allowing later retries", async () => {
    const {client, dispatch, ws, sent} = setup();
    await assert.rejects(client.management.save({timeout: 0}), RangeError);
    await assert.rejects(client.management.save({timeout: Infinity}), RangeError);
    await assert.rejects(client.management.save({timeout: 2147483648}), RangeError);
    const first = client.management.save({timeout: 20});
    await assert.rejects(client.management.save(), /already in progress/);
    assert.equal(sent.length, 1);
    await assert.rejects(first, /Timed out waiting for ship save/);
    assert.equal(client.connected, true, "timeout does not close or reconnect the socket");
    const send = ws.send;
    ws.send = () => { throw new Error("send failed"); };
    await assert.rejects(client.management.save(), /send failed/);
    ws.send = send;
    const retry = client.management.save();
    dispatch("close", closeEvent());
    assert.equal((await retry).code, DropReason.Saved);
    assert.equal(sent.length, 2);
});

test("readonly clients cannot start a ship save", async () => {
    const ws = {readyState: 1, addEventListener() {}, send() { assert.fail("readonly write"); }};
    const client = DredlessClient.attachWebSocket(ws, {mode: "readonly", ready: true});
    await assert.rejects(client.management.save(), /readonly mode/);
});
