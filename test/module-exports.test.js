import assert from "node:assert/strict";
import test from "node:test";

test("layer entrypoints expose the reorganized modules", async () => {
    const [client, network, protocol, state] = await Promise.all([
        import("../src/client/index.js"),
        import("../src/network/index.js"),
        import("../src/protocol/index.js"),
        import("../src/state/index.js")
    ]);

    assert.equal(typeof client.DredlessClient, "function");
    assert.equal(typeof network.Connection, "function");
    assert.equal(typeof network.Session, "function");
    assert.equal(typeof protocol.decodeIncomingFrame, "function");
    assert.equal(typeof protocol.decodeMsgpack, "function");
    assert.equal(typeof state.WorldStore, "function");
    assert.equal(typeof state.ModelState, "function");
});

test("protocol frame decoding is independent of client state", async () => {
    const {decodeIncomingFrame, encodeMsgpack} = await import("../src/protocol/index.js");
    const packet = {type: 21, sid: 7, world: 3};
    assert.deepEqual(decodeIncomingFrame(encodeMsgpack(packet)), packet);
    assert.deepEqual(decodeIncomingFrame(JSON.stringify(packet)), packet);
});
