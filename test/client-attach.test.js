import test from "node:test";
import assert from "node:assert/strict";
import {DredlessClient} from "../src/client.js";
import {encodeMsgpack} from "../src/protocol/msgpack.js";

class MockWebSocket {
    constructor() {
        this.readyState = 1;
        this.OPEN = 1;
        this.binaryType = "";
        this.sent = [];
        this.closed = false;
        this.listeners = new Map();
    }

    addEventListener(type, listener) {
        const listeners = this.listeners.get(type) || [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
    }

    send(payload) {
        this.sent.push(payload);
    }

    close(code, reason) {
        this.closed = {code, reason};
        this.dispatch("close", {code, reason});
    }

    dispatch(type, event = {}) {
        for (const listener of this.listeners.get(type) || []) listener(event);
    }

    message(packet) {
        this.dispatch("message", {data: encodeMsgpack(packet)});
    }
}

test("attachWebSocket observe mode decodes packets and only sends explicit writes", async () => {
    const ws = new MockWebSocket();
    const client = DredlessClient.attachWebSocket(ws);

    assert.equal(client.attachMode, "observe");
    assert.equal(client.connected, true);
    assert.equal(ws.sent.length, 0);

    ws.message({type: 21, sid: 123, world: 55});
    await client.whenReady();

    assert.equal(client.sid, 123);
    assert.equal(client.ready, true);
    assert.equal(ws.sent.length, 0, "observe mode does not bootstrap or keepalive");

    client.sendMessage({type: 7, outfit: {color: 1}});
    assert.equal(ws.sent.length, 1, "explicit message sends are allowed in observe mode");
});

test("attachWebSocket readonly mode decodes but blocks writes and close", async () => {
    const ws = new MockWebSocket();
    const client = DredlessClient.attachWebSocket(ws, {mode: "readonly"});

    ws.message({type: 21, sid: 456, world: 78});
    await client.whenReady();

    assert.equal(client.sid, 456);
    assert.throws(() => client.sendMessage({type: 7}), /readonly mode/);
    assert.throws(() => client.send({x: 1}), /readonly mode/);
    client.close(1000, "test");
    assert.equal(ws.closed, false);
    assert.equal(ws.sent.length, 0);
});

test("attachWebSocket bootstrap mode runs normal automatic websocket flow", async () => {
    const ws = new MockWebSocket();
    const client = DredlessClient.attachWebSocket(ws, {mode: "bootstrap"});

    assert.equal(ws.sent.length, 1, "bootstrap mode sends hello on an already-open socket");

    ws.message({type: 21, sid: 789, world: 12});
    await client.whenReady();

    assert.equal(client.sid, 789);
    assert.ok(ws.sent.length >= 2, "bootstrap mode sends bootstrap after ready");
    client.close(1000, "done");
    assert.deepEqual(ws.closed, {code: 1000, reason: "done"});
});


test("attachWebSocket decodes Blob websocket payloads", async () => {
    const ws = new MockWebSocket();
    const client = DredlessClient.attachWebSocket(ws);

    ws.dispatch("message", {data: new Blob([encodeMsgpack({type: 21, sid: 321, world: 44})])});
    await client.whenReady();

    assert.equal(client.sid, 321);
    assert.equal(client.ready, true);
});
